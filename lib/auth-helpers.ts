import { auth } from "@/auth"

export type SessionContext = {
  userId: string
  studioId: string
  role: "ADMIN" | "TRAINER"
}

export async function requireAdmin(): Promise<SessionContext | null> {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return { userId: session.user.id, studioId: session.user.studioId, role: "ADMIN" }
}

export async function requireTrainer(): Promise<SessionContext | null> {
  const session = await auth()
  if (!session || session.user.role !== "TRAINER") return null
  return { userId: session.user.id, studioId: session.user.studioId, role: "TRAINER" }
}

export async function requireAuth(): Promise<SessionContext | null> {
  const session = await auth()
  if (!session) return null
  return { userId: session.user.id, studioId: session.user.studioId, role: session.user.role as "ADMIN" | "TRAINER" }
}
