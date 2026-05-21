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
  partySize: number
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
      <h2 style="color:#2C6E49;margin:0 0 4px">You're booked! ✓</h2>
      <p style="color:#666;margin:0 0 18px">
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

      <p style="color:#666;font-size:13px;margin:0 0 6px">Show your ticket code at the front desk when you arrive.</p>
      <p style="color:#888;font-size:12px;margin:18px 0 0">
        Need to cancel? Reply to this email or reach out via WhatsApp.
      </p>
      <p style="color:#bbb;font-size:11px;margin:18px 0 0">— BookGravity</p>
    </div>
  `
  try {
    await r.emails.send({ from: FROM, to: clientEmail, subject, html })
  } catch {
    // Swallow — confirmation failure must not break the booking response
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
      <h2 style="color:#2C6E49;margin-bottom:4px">New booking</h2>
      <p style="color:#666;margin-top:0">Hi ${escapeHtml(trainerName)}, a client just booked your class at ${escapeHtml(data.studioName)}.</p>
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
    await r.emails.send({ from: FROM, to: trainerEmail, subject, html })
  } catch {
    // Swallow — booking flow must not fail due to email delivery
  }
}
