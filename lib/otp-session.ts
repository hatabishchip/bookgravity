import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { normalizeOtpPhone } from "@/lib/otp"

// Long-lived "this device already verified these numbers" trust for the public
// booking widget.
//
// After a client proves a number once (WhatsApp code), we drop a signed
// httpOnly cookie remembering that phone at that studio. A repeat booking with
// the SAME phone at the SAME studio skips the code entirely - no second
// WhatsApp message, no waiting - for as long as the cookie lives.
//
// Lifetime: 400 days (the hard cap browsers place on cookie max-age; there is
// no truly "forever" cookie). The window is SLIDING - every verify / booking /
// session check re-issues the cookie with a fresh 400-day expiry, so a client
// who returns at least once a year effectively never sees a code again on that
// device. It is device-bound: httpOnly + SameSite=Lax so page JS can't read it
// and it never rides cross-site POSTs; signed with AUTH_SECRET so it can't be
// forged. A different / unseen number falls back to the normal OTP flow, so the
// anti-spam property holds: every number is verified at least once per device.
//
// Multiple numbers: the cookie holds a LIST of {phone, studioId, exp} entries
// (capped), so a shared device (e.g. a family phone) remembers each number it
// verified - entering any previously-verified number skips the code, a brand
// new number gets verified once and is then added to the list.

const SESSION_TTL_MS = 400 * 24 * 60 * 60 * 1000 // 400 days (browser cookie cap)
const COOKIE_NAME = "gs_otp_session"
const MAX_ENTRIES = 8 // numbers remembered per device (most recent kept)

type Entry = { p: string; s: string; e: number } // phone, studioId, expiry(ms)

function secret(): string | null {
  return process.env.AUTH_SECRET || null
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url")
}

/** Parse + verify the cookie into its live (unexpired) entries. */
function readEntries(req: NextRequest, key: string): Entry[] {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return []
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return []
  const b64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expected = sign(b64, key)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return []

  try {
    const raw = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"))
    if (!Array.isArray(raw)) return []
    const now = Date.now()
    return raw
      .filter(
        (x): x is Entry =>
          x && typeof x.p === "string" && typeof x.s === "string" && typeof x.e === "number" && x.e > now,
      )
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

function writeCookie(res: NextResponse, entries: Entry[], key: string) {
  const b64 = Buffer.from(JSON.stringify(entries)).toString("base64url")
  const token = `${b64}.${sign(b64, key)}`
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    path: "/",
  })
}

/**
 * Remember (or refresh) a verified phone on this device. Merges into whatever
 * the device already trusts: the given phone is bumped to the front with a
 * fresh 400-day expiry (sliding window), other numbers are preserved, the list
 * is de-duplicated and capped. No-op if AUTH_SECRET is absent.
 */
export function attachOtpSession(
  req: NextRequest,
  res: NextResponse,
  opts: { phone: string; studioId: string },
) {
  const key = secret()
  if (!key) return
  const phone = normalizeOtpPhone(opts.phone)
  const exp = Date.now() + SESSION_TTL_MS

  const existing = readEntries(req, key).filter((x) => !(x.p === phone && x.s === opts.studioId))
  const next = [{ p: phone, s: opts.studioId, e: exp }, ...existing].slice(0, MAX_ENTRIES)
  writeCookie(res, next, key)
}

/** True when the device already trusts this phone+studio (valid, unexpired). */
export function hasOtpSession(req: NextRequest, opts: { phone: string; studioId: string }): boolean {
  const key = secret()
  if (!key) return false
  const phone = normalizeOtpPhone(opts.phone)
  return readEntries(req, key).some((x) => x.p === phone && x.s === opts.studioId)
}
