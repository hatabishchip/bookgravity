import { prisma } from "@/lib/prisma"
import { sendWhatsAppTemplate, sendWhatsAppAuthCode, type CloudConfig } from "@/lib/whatsapp-cloud"

// WhatsApp one-time code for public bookings. A 2-digit code (per owner's
// request) is enough to prove the phone is a real, reachable WhatsApp number —
// the point is anti-spam, not high security — and the attempt cap below makes
// brute-forcing 100 combinations impractical.
const CODE_TTL_MS = 10 * 60 * 1000 // code valid 10 minutes
const MAX_ATTEMPTS = 6 // wrong guesses before the code is dead
const RESEND_COOLDOWN_MS = 30 * 1000 // min gap between sends to one number

/** Digits only — matches how we send to Meta and dedupe by number. */
export function normalizeOtpPhone(phone: string): string {
  return phone.replace(/\D/g, "")
}

function generateCode(): string {
  // 10–99 → always exactly two digits.
  return String(10 + Math.floor(Math.random() * 90))
}

export type SendOtpResult =
  | { ok: true }
  | { ok: false; error: "too_soon" | "send_failed" | "no_phone"; retryInSec?: number; detail?: string }

/**
 * Generate + store a fresh code for (studio, phone) and deliver it over
 * WhatsApp using the approved `admin_message` utility template (no new
 * template approval needed). Replaces any previous code for the number.
 */
export async function sendBookingOtp(opts: {
  studioId: string
  phone: string
  name?: string | null
  config: CloudConfig | null
}): Promise<SendOtpResult> {
  const phone = normalizeOtpPhone(opts.phone)
  if (!phone || phone.length < 7) return { ok: false, error: "no_phone" }
  if (!opts.config) return { ok: false, error: "send_failed", detail: "WhatsApp not configured" }

  // Resend throttle: don't spam the same number.
  const recent = await prisma.bookingOtp.findFirst({
    where: { studioId: opts.studioId, phone },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })
  if (recent) {
    const elapsed = Date.now() - recent.createdAt.getTime()
    if (elapsed < RESEND_COOLDOWN_MS) {
      return { ok: false, error: "too_soon", retryInSec: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000) }
    }
  }

  const code = generateCode()
  const firstName = (opts.name ?? "").trim().split(/\s+/)[0] || "there"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
  // Preferred: a WhatsApp AUTHENTICATION template (WHATSAPP_TEMPLATE_OTP_AUTH) —
  // shows the code big in the notification popup + a one-tap "Copy code" button,
  // with essentially no other text. Fallback (until that template is approved):
  // the already-approved admin_message, with the code leading the body so it
  // still shows early in the preview.
  // Default to the approved AUTHENTICATION template (code shown big in the
  // WhatsApp popup + Copy-code button, no expiry line) — the most minimal
  // message Meta's policy permits for an OTP. Override via env if needed.
  const authTemplate = process.env.WHATSAPP_TEMPLATE_OTP_AUTH || "booking_auth_code2"
  let res
  if (authTemplate) {
    res = await sendWhatsAppAuthCode({
      toPhone: phone,
      templateName: authTemplate,
      languageCode: lang,
      code,
      config: opts.config,
    })
  } else {
    // Non-auth path. `admin_message` (approved fallback) takes 2 vars
    // [name, body]; a minimal one-variable code template (e.g. booking_code2 →
    // "Code: {{1}}.") takes just [code].
    const tpl = process.env.WHATSAPP_TEMPLATE_OTP || "admin_message"
    const variables =
      tpl === "admin_message"
        ? [firstName, `${code} is your booking confirmation code - enter it to confirm your class.`]
        : [code]
    res = await sendWhatsAppTemplate({
      toPhone: phone,
      templateName: tpl,
      languageCode: lang,
      variables,
      config: opts.config,
    })
  }
  if (!res.ok) return { ok: false, error: "send_failed", detail: res.error }

  // Only persist the code once Meta accepted the send. Clear old codes first.
  // Store the wamid + status "sent"; the webhook flips it to delivered/read or
  // failed (e.g. number not on WhatsApp) and the widget polls /api/otp/status.
  await prisma.bookingOtp.deleteMany({ where: { studioId: opts.studioId, phone } })
  await prisma.bookingOtp.create({
    data: {
      studioId: opts.studioId,
      phone,
      code,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      waMessageId: res.messageId || null,
      status: "sent",
    },
  })
  return { ok: true }
}

// How long a code may sit in "sent" before we conclude the AUTH template is
// stuck (Meta delivers auth templates ONLY to the primary device - a client
// whose WhatsApp lives on a linked device/web never gets it) and re-send the
// same code via the admin_message utility template, which reaches ALL devices.
// Normal auth delivery lands in 1-3s; 6s is comfortably past that but early
// enough that the fallback arrives before the widget's ~12s no-code bypass.
const FALLBACK_AFTER_MS = 6 * 1000

/**
 * One-shot utility-template fallback for a stuck auth code. Idempotent under
 * the polling race: the caller must have already claimed the row by setting
 * fallbackAt (updateMany with fallbackAt: null). Re-points waMessageId at the
 * fallback message so the delivery webhook tracks the message that matters.
 */
export async function sendOtpFallback(opts: {
  rowId: string
  phone: string
  code: string
  config: CloudConfig | null
}): Promise<void> {
  if (!opts.config) return
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
  const tpl = process.env.WHATSAPP_TEMPLATE_ADMIN_MESSAGE || "admin_message"
  const res = await sendWhatsAppTemplate({
    toPhone: opts.phone,
    templateName: tpl,
    languageCode: lang,
    variables: ["there", `${opts.code} is your booking confirmation code - enter it to confirm your class.`],
    config: opts.config,
  })
  if (res.ok && res.messageId) {
    await prisma.bookingOtp
      .update({ where: { id: opts.rowId }, data: { waMessageId: res.messageId } })
      .catch(() => {})
  }
}

/** True when a code row has waited long enough to deserve the fallback. */
export function otpFallbackDue(row: { status: string; createdAt: Date; fallbackAt: Date | null }): boolean {
  return (
    row.status === "sent" &&
    row.fallbackAt === null &&
    Date.now() - row.createdAt.getTime() > FALLBACK_AFTER_MS
  )
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; error: "missing" | "expired" | "locked" | "wrong"; remaining?: number }

/**
 * Check a client-entered code. Does NOT consume the code on success, so the
 * "you already booked — confirm?" round-trip (which re-POSTs the booking) keeps
 * working within the validity window. Wrong guesses burn an attempt.
 */
export async function verifyBookingOtp(opts: {
  studioId: string
  phone: string
  code: string
}): Promise<VerifyOtpResult> {
  const phone = normalizeOtpPhone(opts.phone)
  const code = (opts.code ?? "").trim()
  if (!code) return { ok: false, error: "missing" }

  const row = await prisma.bookingOtp.findFirst({
    where: { studioId: opts.studioId, phone },
    orderBy: { createdAt: "desc" },
  })
  if (!row || row.expiresAt.getTime() < Date.now()) return { ok: false, error: "expired" }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "locked" }

  if (row.code === code) return { ok: true }

  const attempts = row.attempts + 1
  await prisma.bookingOtp.update({ where: { id: row.id }, data: { attempts } })
  return { ok: false, error: "wrong", remaining: Math.max(0, MAX_ATTEMPTS - attempts) }
}
