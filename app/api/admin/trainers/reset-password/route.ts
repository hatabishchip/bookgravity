import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

// POST /api/admin/trainers/reset-password  body: { id, kind? }
// Admin resets a trainer's (or staff member's) login password to a fresh
// 4-digit PIN and returns it once, so the admin can hand it over. Fixes the
// gap where a trainer added before this system had no visible/known password
// and no self-serve "forgot password" (Sveta 07.07: couldn't get Andrey in).
// Studio-scoped: an admin only resets their own studio's people.
const BodySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["TRAINER", "STAFF"]).optional(),
})

function randomPin(): string {
  // 4 digits, non-crypto is fine for a starter PIN the user changes.
  return String(Math.floor(1000 + Math.random() * 9000))
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Trainer id required" }, { status: 400 })
  const { id, kind } = parsed.data

  // Resolve the User whose password we reset, scoped to this studio.
  let userId: string | null = null
  let label = ""
  if (kind === "STAFF") {
    const u = await prisma.user.findFirst({
      where: { id, studioId: ctx.studioId, role: "STAFF" },
      select: { id: true, email: true, name: true },
    })
    if (u) { userId = u.id; label = u.name ?? u.email }
  } else {
    const t = await prisma.trainer.findFirst({
      where: { id, studioId: ctx.studioId },
      select: { name: true, user: { select: { id: true, email: true } } },
    })
    if (t?.user) { userId = t.user.id; label = t.name }
  }
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const pin = randomPin()
  const hash = await bcrypt.hash(pin, 10)
  await prisma.user.update({
    where: { id: userId },
    // initialPassword mirrors the starter so it stays visible in the Trainers
    // list until the person changes it themselves.
    data: { password: hash, initialPassword: pin },
  })

  return NextResponse.json({ ok: true, name: label, password: pin })
}
