import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
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
