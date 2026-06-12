import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { baliDateStr } from "@/lib/tz"

// Target classes a trainer can move a client's booking to: upcoming slots
// of ANY class type (group / private / kids) in the trainer's studio that
// still have a free spot — a private's capacity of 1 is its own guard. Cross-trainer
// targets are allowed — the receiving trainer gets the standard new-booking
// WhatsApp ping when the move happens, so nothing lands silently.

const HORIZON_DAYS = 60

export async function GET(_req: NextRequest) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const today = baliDateStr(new Date())
  const horizon = baliDateStr(new Date(Date.now() + HORIZON_DAYS * 86400_000))

  const slots = await prisma.timeSlot.findMany({
    where: {
      studioId: ctx.studioId,
      date: { gte: today, lte: horizon },
      // Only classes with an assigned trainer: moving a client to a
      // trainer-less slot would reassign their chat to nobody and the
      // "new booking" ping would reach no one.
      trainerId: { not: null },
    },
    include: {
      trainer: { select: { name: true } },
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })

  const options = slots
    .filter((s) => s._count.bookings < s.maxCapacity)
    .map((s) => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      classType: s.classType,
      trainerName: s.trainer?.name ?? null,
      mine: s.trainerId === trainer.id,
      spotsLeft: s.maxCapacity - s._count.bookings,
    }))

  return NextResponse.json(options)
}
