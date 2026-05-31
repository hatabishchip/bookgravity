import { Resend } from "resend"

// Lazily instantiate so missing env keys don't crash imports.
function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

// Unified brand for outbound mail — the recipient sees "BookGravity"
// regardless of which studio (Canggu / Ubud / future) the booking is for.
// Studio context is conveyed via the email subject and body, not the sender.
const FROM = process.env.MAIL_FROM ?? "BookGravity <noreply@bookgravity.com>"

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const r = getResend()
  if (!r) return
  const url = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`
  await r.emails.send({
    from: FROM,
    to: email,
    subject: "Password reset — Gravity Stretching",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#2C6E49">Password Reset</h2>
        <p>Click the link below to set a new password. The link is valid for 1 hour.</p>
        <a href="${url}" style="display:inline-block;background:#2C6E49;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
          Reset Password
        </a>
        <p style="color:#888;font-size:13px">If you didn't request this, ignore this email.</p>
        <p style="color:#ccc;font-size:11px">${url}</p>
      </div>
    `,
  })
}

export type BookingNotificationData = {
  clientName: string
  clientPhone: string
  clientEmail: string
  date: string        // "YYYY-MM-DD"
  startTime: string   // "HH:mm"
  endTime: string     // "HH:mm"
  classType: string   // GROUP | KIDS | PRIVATE
  studioName: string
  studioSlug: string  // used to build the per-studio logo URL
  partySize: number
}

// Root URL the email's <img> tags resolve against. Prefer the explicit
// MAIL_PUBLIC_URL → NEXTAUTH_URL → hardcoded bookgravity.com fallback so
// emails always have a working absolute URL no matter which subdomain the
// booking was made on.
const PUBLIC_BASE_URL = (
  process.env.MAIL_PUBLIC_URL ??
  process.env.NEXTAUTH_URL ??
  "https://bookgravity.com"
).replace(/\/+$/, "")

function logoTagFor(slug: string) {
  // Cache-bust query param so Gmail/Apple Mail image proxies always fetch the
  // current logo. Without this, the first delivered version of /api/logo?s=…
  // gets cached at the proxy CDN for hours/days and subsequent emails keep
  // showing the stale image even after the studio admin updates the logo.
  const v = Date.now().toString(36)
  const url = `${PUBLIC_BASE_URL}/api/logo?s=${encodeURIComponent(slug)}&v=${v}`
  return `<div style="text-align:center;margin:0 0 18px"><img src="${url}" alt="" style="max-width:180px;max-height:120px;height:auto;display:inline-block"/></div>`
}

function classTypeLabel(t: string) {
  return t === "PRIVATE" ? "Private" : t === "KIDS" ? "Kids" : "Group"
}

// Format ISO date string ("2026-05-20") as a friendly long date for emails.
function prettyDate(date: string) {
  try {
    const d = new Date(`${date}T00:00:00`)
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  } catch {
    return date
  }
}

// Send the client a booking confirmation with their ticket code. Sender is the
// unified BookGravity address — the studio (Canggu / Ubud / etc.) is named in
// the subject + body so the recipient knows which class they booked.
export async function sendClientBookingConfirmation(
  clientEmail: string,
  data: BookingNotificationData & { ticketCode: string; trainerName?: string | null },
) {
  const r = getResend()
  if (!r) return
  const partyLine = data.partySize > 1 ? ` · party of ${data.partySize}` : ""
  const typeLabel = classTypeLabel(data.classType)
  const subject = `Booking confirmed · ${data.studioName} · ${data.date} ${data.startTime}`
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#222">
      ${logoTagFor(data.studioSlug)}
      <h2 style="color:#2C6E49;margin:0 0 4px;text-align:center">You're booked! ✓</h2>
      <p style="color:#666;margin:0 0 18px;text-align:center">
        Hi ${escapeHtml(data.clientName)}, thanks for booking with
        <strong style="color:#2C6E49">${escapeHtml(data.studioName)}</strong>.
      </p>

      <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">
          <div>
            <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#888">Ticket code</div>
            <div style="font-size:32px;font-weight:700;color:#2C6E49;letter-spacing:4px;font-family:monospace">#${escapeHtml(data.ticketCode)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#888">Class</div>
            <div style="font-weight:600">${escapeHtml(typeLabel)}${partyLine}</div>
          </div>
        </div>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:4px 0;color:#888;width:90px">Date</td><td style="padding:4px 0;font-weight:600">${escapeHtml(prettyDate(data.date))}</td></tr>
          <tr><td style="padding:4px 0;color:#888">Time</td><td style="padding:4px 0;font-weight:600">${escapeHtml(data.startTime)}–${escapeHtml(data.endTime)}</td></tr>
          ${data.trainerName ? `<tr><td style="padding:4px 0;color:#888">Trainer</td><td style="padding:4px 0;font-weight:600">${escapeHtml(data.trainerName)}</td></tr>` : ""}
          <tr><td style="padding:4px 0;color:#888">Studio</td><td style="padding:4px 0;font-weight:600">${escapeHtml(data.studioName)}</td></tr>
        </table>
      </div>

      <p style="color:#666;font-size:13px;margin:0 0 6px">Please arrive <b>10 minutes before</b> the class starts.</p>
      <p style="color:#888;font-size:12px;margin:18px 0 0">
        Need to cancel? Send your ticket code <b>${escapeHtml(data.ticketCode)}</b> to our WhatsApp and reply <b>1</b> to confirm.
        Cancellation is available up to 4 hours before the class.
      </p>
      <p style="color:#bbb;font-size:11px;margin:18px 0 0">— BookGravity</p>
    </div>
  `
  try {
    const res = await r.emails.send({ from: FROM, to: clientEmail, subject, html })
    if (res.error) {
      console.error("[mailer] client confirmation failed:", res.error)
    } else {
      console.log("[mailer] client confirmation sent:", res.data?.id, "→", clientEmail)
    }
  } catch (err) {
    console.error("[mailer] client confirmation exception:", err)
  }
}

// Notify a trainer that a client booked one of their sessions. Best-effort —
// failures are swallowed so they never break the booking flow itself.
export async function sendTrainerBookingNotification(
  trainerEmail: string,
  trainerName: string,
  data: BookingNotificationData,
) {
  const r = getResend()
  if (!r) return
  const subject = `New booking · ${data.date} ${data.startTime} · ${data.clientName}`
  const partyLine = data.partySize > 1 ? ` (party of ${data.partySize})` : ""
  const typeLabel = data.classType === "PRIVATE" ? "Private" : data.classType === "KIDS" ? "Kids" : "Group"
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      ${logoTagFor(data.studioSlug)}
      <h2 style="color:#2C6E49;margin-bottom:4px;text-align:center">New booking</h2>
      <p style="color:#666;margin-top:0;text-align:center">Hi ${escapeHtml(trainerName)}, a client just booked your class at <strong>${escapeHtml(data.studioName)}</strong>.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:6px 0;color:#888;width:120px">Class</td><td style="padding:6px 0;font-weight:600">${escapeHtml(typeLabel)} class${partyLine}</td></tr>
        <tr><td style="padding:6px 0;color:#888">When</td><td style="padding:6px 0;font-weight:600">${escapeHtml(data.date)} · ${escapeHtml(data.startTime)}–${escapeHtml(data.endTime)}</td></tr>
        <tr><td style="padding:6px 0;color:#888">Client</td><td style="padding:6px 0;font-weight:600">${escapeHtml(data.clientName)}</td></tr>
        <tr><td style="padding:6px 0;color:#888">Phone</td><td style="padding:6px 0"><a href="tel:${encodeURIComponent(data.clientPhone)}" style="color:#2C6E49">${escapeHtml(data.clientPhone)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#888">Email</td><td style="padding:6px 0"><a href="mailto:${encodeURIComponent(data.clientEmail)}" style="color:#2C6E49">${escapeHtml(data.clientEmail)}</a></td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:16px">You can manage this booking in your trainer dashboard.</p>
    </div>
  `
  try {
    const res = await r.emails.send({ from: FROM, to: trainerEmail, subject, html })
    if (res.error) {
      console.error("[mailer] trainer notification failed:", res.error, "→", trainerEmail)
    } else {
      console.log("[mailer] trainer notification sent:", res.data?.id, "→", trainerEmail)
    }
  } catch (err) {
    console.error("[mailer] trainer notification exception:", err, "→", trainerEmail)
  }
}

// ---------------------------------------------------------------------------
// Forward every inbound WhatsApp message (received on the corporate number)
// to the owner's email as a copy. This sidesteps Meta's 24h customer-service
// window — which made the WhatsApp-to-WhatsApp forward impractical — by
// using email instead. Recipient is OWNER_NOTIFY_EMAIL (Vercel env).
//
// Media attachments are passed through verbatim: the webhook fetches the
// bytes from Meta and hands them off; we just attach. If decoding the
// media failed, the email still goes with a short note explaining why.
// ---------------------------------------------------------------------------

/** Pretty type-aware subject header. */
function describeInboundType(t: string): { emoji: string; label: string } {
  switch (t) {
    case "text":
      return { emoji: "📨", label: "message" }
    case "image":
      return { emoji: "📷", label: "photo" }
    case "video":
      return { emoji: "🎬", label: "video" }
    case "audio":
      return { emoji: "🎤", label: "voice" }
    case "sticker":
      return { emoji: "💬", label: "sticker" }
    case "document":
      return { emoji: "📄", label: "document" }
    default:
      return { emoji: "📨", label: t }
  }
}

export async function sendInboundWhatsAppCopy(opts: {
  /** Bare digits Meta gave us in `from`. We render it with a leading +. */
  fromPhone: string
  /** WhatsApp profile name if Meta provided it. */
  fromName?: string | null
  /** Inbound type — text / image / video / audio / sticker / document / ... */
  type: string
  /** Text body or media caption. */
  body: string | null
  /** Optional decoded media to attach. */
  media?: {
    bytes: Buffer
    mimeType: string
    /** Filename for the email attachment + Meta document filename, if any. */
    filename: string
  } | null
  /** Receive time from Meta (defaults to now). */
  receivedAt?: Date
}): Promise<{ ok: boolean; error?: string }> {
  const to = process.env.OWNER_NOTIFY_EMAIL
  if (!to) return { ok: false, error: "OWNER_NOTIFY_EMAIL not set" }
  const r = getResend()
  if (!r) return { ok: false, error: "resend_not_configured" }

  const senderLabel = opts.fromName?.trim()
    ? `${opts.fromName.trim()} (+${opts.fromPhone})`
    : `+${opts.fromPhone}`
  const { emoji, label } = describeInboundType(opts.type)
  const subject = `${emoji} WhatsApp ${label} from ${senderLabel}`
  const when = (opts.receivedAt ?? new Date()).toLocaleString("en-GB", {
    timeZone: "Asia/Makassar", // Bali — owner-local
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
  const bodyHtml = opts.body
    ? `<div style="white-space:pre-wrap;font-size:15px;line-height:1.5;color:#222;border-left:3px solid #2C6E49;padding:8px 12px;background:#F6F8F6;border-radius:6px;margin:12px 0">${escapeHtml(
        opts.body,
      )}</div>`
    : ""
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#222">
      <div style="font-size:13px;color:#888;margin-bottom:4px">${escapeHtml(when)} • Asia/Makassar</div>
      <div style="font-size:17px;font-weight:600;color:#2C6E49;margin-bottom:8px">${emoji} ${escapeHtml(senderLabel)}</div>
      <div style="font-size:13px;color:#888;margin-bottom:8px">Type: <b>${escapeHtml(opts.type)}</b>${
        opts.media ? ` • <b>${escapeHtml(opts.media.filename)}</b> (${escapeHtml(opts.media.mimeType)})` : ""
      }</div>
      ${bodyHtml || (opts.media ? `<div style="font-size:13px;color:#888">(attachment below)</div>` : `<div style="font-size:13px;color:#888">(no text)</div>`)}
      <hr style="border:0;border-top:1px solid #eee;margin:20px 0" />
      <div style="font-size:12px;color:#aaa">Forwarded from the corporate WhatsApp number to ${escapeHtml(to)}.</div>
    </div>
  `

  try {
    const res = await r.emails.send({
      from: FROM,
      to,
      subject,
      html,
      ...(opts.media
        ? {
            attachments: [
              {
                filename: opts.media.filename,
                content: opts.media.bytes,
              },
            ],
          }
        : {}),
    })
    if (res.error) {
      console.error("[mailer] wa inbound copy failed:", res.error, "→", to)
      return { ok: false, error: String(res.error) }
    }
    console.log("[mailer] wa inbound copy sent:", res.data?.id, "→", to)
    return { ok: true }
  } catch (err) {
    console.error("[mailer] wa inbound copy exception:", err, "→", to)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
