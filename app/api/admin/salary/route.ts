import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { computeSalary, FLAT_RATE } from "@/lib/salary"

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7)

  const [year, mon] = month.split("-").map(Number)
  const monthStart = `${month}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`

  const slotFilter = { date: { gte: monthStart, lte: monthEnd }, studioId: ctx.studioId }
  const paidBookingsFilter = { status: "CONFIRMED", paymentStatus: "PAID" }

  // Each paid booking counts at its marked price tier (Full / Member / Local);
  // legacy rows with no tier fall back to the old localResident flag.
  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { localPrice: true, membershipClassPrice: true },
  })
  const localPrice = studio?.localPrice ?? 200000
  const memberPrice = studio?.membershipClassPrice ?? 250000

  const trainers = await prisma.trainer.findMany({
    where: { studioId: ctx.studioId },
    orderBy: { name: "asc" },
    include: {
      user: { select: { email: true } },
      payments: { where: { month, studioId: ctx.studioId } },
      timeSlots: {
        where: slotFilter,
        include: {
          bookings: { where: paidBookingsFilter },
          assistant: { select: { id: true } },
        },
      },
      assistedSlots: {
        where: slotFilter,
        include: {
          bookings: { where: paidBookingsFilter },
        },
      },
    },
  })

  const result = trainers.map((trainer) => {
    const sessions = trainer.timeSlots.length
    // Shared commission math (one row per paid class; totals summed from rows).
    const { breakdown, commission, totalPaid: revenue, paidBookingsCount } = computeSalary({
      leadSlots: trainer.timeSlots,
      assistedSlots: trainer.assistedSlots,
      prices: { memberPrice, localPrice },
    })

    // kind "accrual" = a manual amount the studio owes the trainer (adds to
    // ACCRUED); kind "payout" (default) = money actually paid out.
    const adjustments = trainer.payments.filter((p) => p.kind === "accrual").reduce((sum, p) => sum + p.amount, 0)
    const paid = trainer.payments.filter((p) => p.kind !== "accrual").reduce((sum, p) => sum + p.amount, 0)
    const accrued = commission + adjustments
    const balance = accrued - paid

    return {
      id: trainer.id,
      name: trainer.name,
      email: trainer.user.email,
      commissionRate: FLAT_RATE,
      sessions,
      paidBookings: paidBookingsCount,
      revenue,
      commission,
      baseSalary: 0,
      accrued,
      paid,
      balance,
      payments: trainer.payments,
      breakdown,
    }
  })

  return NextResponse.json(result)
}
