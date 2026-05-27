import { auth } from "@/auth"
import { getStudioIdBySubdomain } from "@/lib/studio"

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
async function studioForSession(session: NonNullable<Awaited<ReturnType<typeof auth>>>): Promise<string> {
  if (session.user.role === "SUPER_ADMIN") {
    try {
      return await getStudioIdBySubdomain()
    } catch {
      return session.user.studioId
    }
  }
  return session.user.studioId
}

export async function requireAdmin(): Promise<SessionContext | null> {
  const session = await auth()
  if (!session) return null
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") return null
  const studioId = await studioForSession(session)
  return { userId: session.user.id, studioId, role: session.user.role as UserRole }
}

export async function requireTrainer(): Promise<SessionContext | null> {
  const session = await auth()
  if (!session || session.user.role !== "TRAINER") return null
  return { userId: session.user.id, studioId: session.user.studioId, role: "TRAINER" }
}

export async function requireSuperAdmin(): Promise<SessionContext | null> {
  const session = await auth()
  if (!session || session.user.role !== "SUPER_ADMIN") return null
  return { userId: session.user.id, studioId: session.user.studioId, role: "SUPER_ADMIN" }
}

export async function requireAuth(): Promise<SessionContext | null> {
  const session = await auth()
  if (!session) return null
  const studioId = await studioForSession(session)
  return { userId: session.user.id, studioId, role: session.user.role as UserRole }
}
