import { prisma } from "@/lib/prisma"
import { sendWhatsAppTemplate, type CloudConfig } from "@/lib/whatsapp-cloud"

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
  const templateName = process.env.WHATSAPP_TEMPLATE_OTP || "admin_message"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
  const message =
    `Your booking confirmation code is ${code}. ` +
    `Enter it on the booking page to confirm your class. ` +
    `Didn't request this? Just ignore it.`

  const res = await sendWhatsAppTemplate({
    toPhone: phone,
    templateName,
    languageCode: lang,
    variables: [firstName, message],
    config: opts.config,
  })
  if (!res.ok) return { ok: false, error: "send_failed", detail: res.error }

  // Only persist the code once Meta accepted the send. Clear old codes first.
  await prisma.bookingOtp.deleteMany({ where: { studioId: opts.studioId, phone } })
  await prisma.bookingOtp.create({
    data: { studioId: opts.studioId, phone, code, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  })
  return { ok: true }
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
