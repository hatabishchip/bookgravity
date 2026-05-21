import { Resend } from "resend"

// Lazily instantiate so missing env keys don't crash imports.
function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

const FROM = process.env.MAIL_FROM ?? "Gravity Stretching <noreply@bookgravity.com>"

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
