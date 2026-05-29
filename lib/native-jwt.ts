import { createHmac, randomBytes, timingSafeEqual } from "crypto"

// Lightweight HS256 JWT for the native (iOS / Android) clients.
//
// We deliberately do NOT reuse the NextAuth session cookie for native:
// - The cookie depends on Next.js's edge runtime + same-origin browser
//   semantics, neither of which apply on a phone.
// - SecureStore on the phone wants a plain string to keep in the keychain.
// - We want to revoke a single device session without invalidating every
//   web cookie, so the two surfaces should have separate token pools.
//
// Signing key precedence:
//   NATIVE_JWT_SECRET (preferred — set explicitly per env)
//   AUTH_SECRET       (NextAuth secret — guaranteed to exist in prod)
// If neither is set in development we fall back to a constant so the API
// doesn't crash, with a console warning. Production deploys must set one.

const ACCESS_TTL_MS = 14 * 24 * 60 * 60 * 1000  // 14 days
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

function getSecret(): Buffer {
  const key = process.env.NATIVE_JWT_SECRET || process.env.AUTH_SECRET
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[native-jwt] No NATIVE_JWT_SECRET / AUTH_SECRET; using dev fallback")
      return Buffer.from("dev-only-do-not-ship", "utf8")
    }
    throw new Error("Missing NATIVE_JWT_SECRET / AUTH_SECRET in production")
  }
  return Buffer.from(key, "utf8")
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64")
}

export type NativeJwtPayload = {
  sub: string         // userId
  role: string
  studioId: string
  studioSlug: string
  type: "access" | "refresh"
  iat: number
  exp: number
  jti: string         // unique token id — future revocation hook
}

export function signAccessToken(input: Omit<NativeJwtPayload, "iat" | "exp" | "jti" | "type">): { token: string; expiresAt: number } {
  return signToken({ ...input, type: "access" }, ACCESS_TTL_MS)
}

export function signRefreshToken(input: Omit<NativeJwtPayload, "iat" | "exp" | "jti" | "type">): { token: string; expiresAt: number } {
  return signToken({ ...input, type: "refresh" }, REFRESH_TTL_MS)
}

function signToken(payload: Omit<NativeJwtPayload, "iat" | "exp" | "jti">, ttlMs: number): { token: string; expiresAt: number } {
  const now = Date.now()
  const exp = now + ttlMs
  const full: NativeJwtPayload = {
    ...payload,
    iat: Math.floor(now / 1000),
    exp: Math.floor(exp / 1000),
    jti: randomBytes(12).toString("hex"),
  }
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8"))
  const body = b64url(Buffer.from(JSON.stringify(full), "utf8"))
  const sig = b64url(createHmac("sha256", getSecret()).update(`${header}.${body}`).digest())
  return { token: `${header}.${body}.${sig}`, expiresAt: exp }
}

export function verifyToken(token: string): NativeJwtPayload | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [header, body, sig] = parts
    const expected = b64url(createHmac("sha256", getSecret()).update(`${header}.${body}`).digest())
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as NativeJwtPayload
    if (payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
