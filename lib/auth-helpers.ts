import { auth } from "@/auth"
import { headers } from "next/headers"
import { verifyToken } from "@/lib/native-jwt"
import type { Session } from "next-auth"

export type UserRole = "ADMIN" | "TRAINER" | "SUPER_ADMIN" | "STAFF"

export type SessionContext = {
  userId: string
  studioId: string
  role: UserRole
}

// Resolve the studioId an admin endpoint should scope to. EVERY role —
// including SUPER_ADMIN — is pinned to their own account's studioId. This is
// deliberate: previously SUPER_ADMIN followed the current studio cookie/host,
// which meant simply viewing a public booking page (e.g. /ubud) silently
// switched which studio their /admin managed. Each studio now has its own
// admin account, and platform-wide management lives in /sadmin, so there's no
// reason for the super-admin's dashboard to drift between studios.
async function studioForSession(session: Session): Promise<string> {
  return session.user.studioId
}

// Read the incoming request's Authorization: Bearer <jwt> header. Used to
// authenticate the mobile app, which can't carry the NextAuth session cookie.
// Returns a SessionContext-shaped value derived from a verified native JWT,
// or null when no valid token is present.
async function tryBearer(): Promise<SessionContext | null> {
  try {
    const h = await headers()
    const auth = h.get("authorization") ?? ""
    const m = /^Bearer (.+)$/.exec(auth)
    if (!m) return null
    const payload = verifyToken(m[1])
    if (!payload || payload.type !== "access") return null
    return {
      userId: payload.sub,
      studioId: payload.studioId,
      role: payload.role as UserRole,
    }
  } catch {
    return null
  }
}

export async function requireAdmin(): Promise<SessionContext | null> {
  const bearer = await tryBearer()
  if (bearer) {
    return bearer.role === "ADMIN" || bearer.role === "SUPER_ADMIN" ? bearer : null
  }
  const session = await auth()
  if (!session) return null
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") return null
  const studioId = await studioForSession(session)
  return { userId: session.user.id, studioId, role: session.user.role as UserRole }
}

export async function requireTrainer(): Promise<SessionContext | null> {
  const bearer = await tryBearer()
  if (bearer) return bearer.role === "TRAINER" ? bearer : null
  const session = await auth()
  if (!session || session.user.role !== "TRAINER") return null
  return { userId: session.user.id, studioId: session.user.studioId, role: "TRAINER" }
}

// Cleaning/support staff: read-only access to the studio's class schedule so
// they know when they can clean (no client lists, no editing). SUPER_ADMIN is
// allowed through too, so the owner can preview the staff view.
export async function requireStaff(): Promise<SessionContext | null> {
  const bearer = await tryBearer()
  if (bearer) return bearer.role === "STAFF" || bearer.role === "SUPER_ADMIN" ? bearer : null
  const session = await auth()
  if (!session) return null
  if (session.user.role !== "STAFF" && session.user.role !== "SUPER_ADMIN") return null
  const studioId = await studioForSession(session)
  return { userId: session.user.id, studioId, role: session.user.role as UserRole }
}

export async function requireSuperAdmin(): Promise<SessionContext | null> {
  const bearer = await tryBearer()
  if (bearer) return bearer.role === "SUPER_ADMIN" ? bearer : null
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") return null
  return { userId: session.user.id, studioId: session.user.studioId, role: "SUPER_ADMIN" }
}

export async function requireAuth(): Promise<SessionContext | null> {
  const bearer = await tryBearer()
  if (bearer) return bearer
  const session = await auth()
  if (!session) return null
  const studioId = await studioForSession(session)
  return { userId: session.user.id, studioId, role: session.user.role as UserRole }
}

/**
 * Is the caller a logged-in ADMIN/TRAINER (or SUPER_ADMIN) of THIS studio?
 * Used by the PUBLIC booking flow to skip the WhatsApp confirmation code when
 * a staff member books on a client's behalf - the anti-spam gate exists to
 * stop strangers, not the studio's own team (Yacinta's case 2026-07-03: she
 * booked a client via the public page and got stuck waiting for the CLIENT's
 * code). Best-effort: returns false rather than throwing.
 */
export async function isStaffOfStudio(studioId: string): Promise<boolean> {
  try {
    const ctx = await requireAuth()
    if (!ctx) return false
    if (ctx.role === "STAFF") return false // cleaning staff can't book clients
    return ctx.role === "SUPER_ADMIN" || ctx.studioId === studioId
  } catch {
    return false
  }
}
