import { NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { format, startOfMonth, endOfMonth } from "date-fns"

const BASE_SALARY = 1_000_000
const ASSISTANT_RATE = 5

export async function GET() {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const now = new Date()
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd")
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd")
  const slotFilter = { date: { gte: monthStart, lte: monthEnd }, studioId: ctx.studioId }
  const paidFilter = { status: "CONFIRMED", paymentStatus: "PAID" }

  // Main trainer slots with assistant info
  const mainSlots = await prisma.timeSlot.findMany({
    where: { trainerId: trainer.id, ...slotFilter },
    include: {
      bookings: { where: paidFilter },
      assistant: { select: { id: true } },
    },
  })

  // Slots where trainer is assistant
  const assistedSlots = await prisma.timeSlot.findMany({
    where: { assistantId: trainer.id, ...slotFilter },
    include: { bookings: { where: paidFilter } },
  })

  let mainCommission = 0
  let paidBookingsCount = 0
  let totalPaid = 0
  for (const slot of mainSlots) {
    const effectiveRate = slot.assistant ? trainer.commissionRate - ASSISTANT_RATE : trainer.commissionRate
    const slotRevenue = slot.price * slot.bookings.length
    mainCommission += Math.round(slotRevenue * effectiveRate / 100)
    paidBookingsCount += slot.bookings.length
    totalPaid += slotRevenue
  }

  let assistantCommission = 0
  for (const slot of assistedSlots) {
    assistantCommission += Math.round(slot.price * slot.bookings.length * ASSISTANT_RATE / 100)
  }

  const commission = mainCommission + assistantCommission

  return NextResponse.json({
    baseSalary: BASE_SALARY,
    commissionRate: trainer.commissionRate,
    totalPaid,
    commission,
    total: BASE_SALARY + commission,
    paidBookingsCount,
    month: format(now, "MMMM yyyy"),
  })
}
