import { auth } from "@/auth"
import { getStudioIdBySubdomain } from "@/lib/studio"
import { headers } from "next/headers"
import { verifyToken } from "@/lib/native-jwt"
import type { Session } from "next-auth"

export type UserRole = "ADMIN" | "TRAINER" | "SUPER_ADMIN"

export type SessionContext = {
  userId: string
  studioId: string
  role: UserRole
}

// Resolve the studioId an admin endpoint should scope to:
// - ADMIN / TRAINER: always their session's studioId (per-tenant isolation).
// - SUPER_ADMIN: studio of the current subdomain — lets the platform owner
//   manage Ubud by visiting ubud.bookgravity.com/admin, etc. Falls back to
//   their own studioId if the subdomain lookup throws.
async function studioForSession(session: Session): Promise<string> {
  if (session.user.role === "SUPER_ADMIN") {
    try {
      return await getStudioIdBySubdomain()
    } catch {
      return session.user.studioId
    }
  }
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
