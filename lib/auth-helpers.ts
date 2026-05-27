import { auth } from "@/auth"

export type UserRole = "ADMIN" | "TRAINER" | "SUPER_ADMIN"

export type SessionContext = {
  userId: string
  studioId: string
  role: UserRole
}

export async function requireAdmin(): Promise<SessionContext | null> {
  const session = await auth()
  if (!session) return null
  // SUPER_ADMIN has admin powers everywhere it's authenticated against; ADMIN
  // is the per-studio admin. Anything else (TRAINER, public visitor) → null.
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") return null
  return { userId: session.user.id, studioId: session.user.studioId, role: session.user.role as UserRole }
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
  return { userId: session.user.id, studioId: session.user.studioId, role: session.user.role as UserRole }
}
