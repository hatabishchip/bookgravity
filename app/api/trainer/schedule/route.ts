import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const today = new Date().toISOString().split("T")[0]
  const slots = await prisma.timeSlot.findMany({
    where: {
      trainerId: trainer.id,
      studioId: ctx.studioId,
      date: {
        gte: from ?? today,
        ...(to ? { lte: to } : {}),
      },
    },
    include: {
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })

  return NextResponse.json(slots)
}
