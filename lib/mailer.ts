import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.MAIL_FROM ?? "Gravity Stretching <noreply@bookgravity.com>"

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`
  await resend.emails.send({
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
