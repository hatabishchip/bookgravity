import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { normalizeOtpPhone } from "@/lib/otp"

// Short-lived "this phone is verified" session for the public booking widget.
//
// After a client proves a number once (WhatsApp code), we drop a signed
// httpOnly cookie valid for 2 hours. A repeat booking inside that window with
// the SAME phone at the SAME studio skips the code entirely — no second
// WhatsApp message, no waiting. A different phone or studio (or a tampered
// cookie) falls back to the normal OTP flow, so the anti-spam property holds:
// every number still gets verified at least once per window.
//
// Stateless HMAC token (no DB): payload `phone.studioId.exp` signed with
// AUTH_SECRET. httpOnly + SameSite=Lax so page JS can't read it and it never
// rides on cross-site POSTs.

const SESSION_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours
const COOKIE_NAME = "gs_otp_session"

function secret(): string | null {
  return process.env.AUTH_SECRET || null
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url")
}

/** Set the verified-phone cookie on a response. No-op if AUTH_SECRET is absent. */
export function attachOtpSession(res: NextResponse, opts: { phone: string; studioId: string }) {
  const key = secret()
  if (!key) return
  const phone = normalizeOtpPhone(opts.phone)
  const exp = Date.now() + SESSION_TTL_MS
  const payload = `${phone}.${opts.studioId}.${exp}`
  const token = `${payload}.${sign(payload, key)}`
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    path: "/",
  })
}

/** True when the request carries a valid, unexpired session for this phone+studio. */
export function hasOtpSession(req: NextRequest, opts: { phone: string; studioId: string }): boolean {
  const key = secret()
  if (!key) return false
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return false

  const parts = token.split(".")
  if (parts.length !== 4) return false
  const [phone, studioId, expStr, sig] = parts
  const payload = `${phone}.${studioId}.${expStr}`

  const expected = sign(payload, key)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false

  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return false

  return phone === normalizeOtpPhone(opts.phone) && studioId === opts.studioId
}
