// Super-admin impersonation token. The super-admin mints a short-lived,
// HMAC-signed token for a specific user id; the Credentials provider accepts it
// in place of a password to sign in AS that user. Signed with AUTH_SECRET so
// only the server can mint/verify it.
import { createHmac, timingSafeEqual } from "crypto"

const TTL_MS = 2 * 60 * 1000 // 2 minutes — just long enough to open the tab.

function secret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || ""
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex")
}

/** Token = "<userId>.<expiresMs>.<hmac>". */
export function signImpersonationToken(userId: string): string {
  const exp = Date.now() + TTL_MS
  const payload = `${userId}.${exp}`
  return `${payload}.${sign(payload)}`
}

/** Returns the userId if the token is valid + unexpired, else null. */
export function verifyImpersonationToken(token: string | null | undefined): string | null {
  if (!token || !secret()) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [userId, expStr, mac] = parts
  const payload = `${userId}.${expStr}`
  const expected = sign(payload)
  // Constant-time compare.
  try {
    const a = Buffer.from(mac, "hex")
    const b = Buffer.from(expected, "hex")
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || Date.now() > exp) return null
  return userId
}
