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
  // Fetch ALL slots in the studio (assigned or not), so the trainer sees
  // others' time as occupied without any details.
  const slots = await prisma.timeSlot.findMany({
    where: {
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

  // Three states:
  //  - mine: own slot, full info
  //  - unassigned: no trainer set, expose bookings/capacity so the trainer
  //    can ask the admin to be assigned
  //  - other: another trainer is assigned, just an "Occupied" placeholder
  const sanitized = slots.map((s) => {
    if (s.trainerId === trainer.id) return { ...s, state: "mine" as const }
    if (s.trainerId === null) {
      return {
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        maxCapacity: s.maxCapacity,
        _count: s._count,
        state: "unassigned" as const,
      }
    }
    return {
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      state: "other" as const,
    }
  })

  return NextResponse.json(sanitized)
}
