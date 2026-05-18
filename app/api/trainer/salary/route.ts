import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { format, startOfMonth, endOfMonth, parse } from "date-fns"

const BASE_SALARY = 1_000_000
const ASSISTANT_RATE = 5

export async function GET(request: NextRequest) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  // Optional ?month=yyyy-MM. Defaults to current month.
  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get("month")
  let anchor: Date
  if (monthParam) {
    const parsed = parse(monthParam, "yyyy-MM", new Date())
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid month" }, { status: 400 })
    }
    anchor = parsed
  } else {
    anchor = new Date()
  }

  // Reject future months — they only have zero data, not interesting.
  const now = new Date()
  if (startOfMonth(anchor).getTime() > startOfMonth(now).getTime()) {
    return NextResponse.json({ error: "Future months are not available" }, { status: 400 })
  }

  const monthStart = format(startOfMonth(anchor), "yyyy-MM-dd")
  const monthEnd = format(endOfMonth(anchor), "yyyy-MM-dd")
  const slotFilter = { date: { gte: monthStart, lte: monthEnd }, studioId: ctx.studioId }
  const paidFilter = { status: "CONFIRMED", paymentStatus: "PAID" }

  const mainSlots = await prisma.timeSlot.findMany({
    where: { trainerId: trainer.id, ...slotFilter },
    include: {
      bookings: { where: paidFilter },
      assistant: { select: { id: true } },
    },
  })

  const assistedSlots = await prisma.timeSlot.findMany({
    where: { assistantId: trainer.id, ...slotFilter },
    include: { bookings: { where: paidFilter } },
  })

  let mainCommission = 0
  let paidBookingsCount = 0
  let totalPaid = 0
  let sessionsWorked = 0
  for (const slot of mainSlots) {
    const effectiveRate = slot.assistant ? trainer.commissionRate - ASSISTANT_RATE : trainer.commissionRate
    const slotRevenue = slot.price * slot.bookings.length
    mainCommission += Math.round(slotRevenue * effectiveRate / 100)
    paidBookingsCount += slot.bookings.length
    totalPaid += slotRevenue
    if (slot.bookings.length > 0) sessionsWorked++
  }

  let assistantCommission = 0
  let assistedCount = 0
  for (const slot of assistedSlots) {
    const slotRevenue = slot.price * slot.bookings.length
    assistantCommission += Math.round(slotRevenue * ASSISTANT_RATE / 100)
    if (slot.bookings.length > 0) assistedCount++
  }

  const commission = mainCommission + assistantCommission

  return NextResponse.json({
    baseSalary: BASE_SALARY,
    commissionRate: trainer.commissionRate,
    assistantRate: ASSISTANT_RATE,
    totalPaid,
    mainCommission,
    assistantCommission,
    commission,
    total: BASE_SALARY + commission,
    paidBookingsCount,
    sessionsWorked,
    assistedCount,
    month: format(anchor, "yyyy-MM"),
    monthLabel: format(anchor, "MMMM yyyy"),
  })
}
