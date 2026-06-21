import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

// Trainers earn a flat 20% commission — no fixed base salary anymore. When a
// slot has an assistant, the main trainer's share drops by ASSISTANT_RATE and
// the assistant earns that 5%.
const FLAT_RATE = 20
const ASSISTANT_RATE = 5

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

  // Local-resident discount: a paid booking marked local counts at localPrice.
  const studio = await prisma.studio.findUnique({ where: { id: ctx.studioId }, select: { localPrice: true } })
  const localPrice = studio?.localPrice ?? 200000
  const bookingAmount = (b: { localResident: boolean }, slotPrice: number) =>
    b.localResident ? localPrice : slotPrice

  type Row = {
    bookingId: string
    date: string
    startTime: string
    classType: string
    client: string
    paymentType: string
    amount: number
    rate: number
    commission: number
    role: "lead" | "assistant"
  }

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
    // One row per paid class so the admin can audit each line (Sveta's
    // "Employee commissions" sheet). Totals are summed from these rows.
    const breakdown: Row[] = []

    // Commission as main trainer — reduce by ASSISTANT_RATE if slot has an assistant
    let mainCommission = 0
    let paidBookingsCount = 0
    let revenue = 0
    for (const slot of trainer.timeSlots) {
      const effectiveRate = slot.assistant ? FLAT_RATE - ASSISTANT_RATE : FLAT_RATE
      for (const b of slot.bookings) {
        const amount = bookingAmount(b, slot.price)
        const commission = Math.round(amount * effectiveRate / 100)
        mainCommission += commission
        revenue += amount
        breakdown.push({
          bookingId: b.id, date: slot.date, startTime: slot.startTime, classType: slot.classType,
          client: b.clientName, paymentType: b.paymentType, amount, rate: effectiveRate, commission,
          role: "lead",
        })
      }
      paidBookingsCount += slot.bookings.length
    }

    // Commission as assistant (5% per paid booking in assisted slots)
    let assistantCommission = 0
    for (const slot of trainer.assistedSlots) {
      for (const b of slot.bookings) {
        const amount = bookingAmount(b, slot.price)
        const commission = Math.round(amount * ASSISTANT_RATE / 100)
        assistantCommission += commission
        breakdown.push({
          bookingId: b.id, date: slot.date, startTime: slot.startTime, classType: slot.classType,
          client: b.clientName, paymentType: b.paymentType, amount, rate: ASSISTANT_RATE, commission,
          role: "assistant",
        })
      }
    }

    breakdown.sort((a, b) => (a.date === b.date ? b.startTime.localeCompare(a.startTime) : b.date.localeCompare(a.date)))

    const commission = mainCommission + assistantCommission
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
