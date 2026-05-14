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
  const slotId = searchParams.get("slotId")

  const bookings = await prisma.booking.findMany({
    where: {
      slot: { trainerId: trainer.id, studioId: ctx.studioId },
      status: "CONFIRMED",
      ...(slotId ? { slotId } : {}),
    },
    include: {
      slot: true,
      services: { include: { service: true } },
    },
    orderBy: [{ slot: { date: "asc" } }, { slot: { startTime: "asc" } }],
  })

  return NextResponse.json(bookings)
}
