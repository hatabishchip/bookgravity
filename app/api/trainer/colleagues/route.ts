import { NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Active colleagues in MY studio (for the handover picker) — just id+name,
// excluding me and archived trainers.
export async function GET() {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
    select: { id: true },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const colleagues = await prisma.trainer.findMany({
    where: { studioId: ctx.studioId, archived: false, id: { not: trainer.id } },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(colleagues)
}
