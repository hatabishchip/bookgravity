import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { computeSalary, FLAT_RATE, ASSISTANT_RATE } from "@/lib/salary"
import { format, startOfMonth, endOfMonth, parse } from "date-fns"

export async function GET(request: NextRequest) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  // Each paid booking earns commission on its marked price tier (Full / Member /
  // Local); legacy rows with no tier fall back to the old localResident flag.
  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { localPrice: true, membershipClassPrice: true },
  })
  const localPrice = studio?.localPrice ?? 200000
  const memberPrice = studio?.membershipClassPrice ?? 250000

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

  const {
    breakdown,
    mainCommission,
    assistantCommission,
    commission,
    totalPaid,
    paidBookingsCount,
    sessionsWorked,
    assistedCount,
  } = computeSalary({ leadSlots: mainSlots, assistedSlots, prices: { memberPrice, localPrice } })

  return NextResponse.json({
    baseSalary: 0,
    commissionRate: FLAT_RATE,
    assistantRate: ASSISTANT_RATE,
    totalPaid,
    mainCommission,
    assistantCommission,
    commission,
    total: commission,
    paidBookingsCount,
    sessionsWorked,
    assistedCount,
    breakdown,
    month: format(anchor, "yyyy-MM"),
    monthLabel: format(anchor, "MMMM yyyy"),
  })
}
