import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

const BASE_SALARY = 1_000_000
const ASSISTANT_RATE = 5

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

export async function GET(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7)

  const [year, mon] = month.split("-").map(Number)
  const monthStart = `${month}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`

  const slotFilter = { date: { gte: monthStart, lte: monthEnd } }
  const paidBookingsFilter = { status: "CONFIRMED", paymentStatus: "PAID" }

  const trainers = await prisma.trainer.findMany({
    orderBy: { name: "asc" },
    include: {
      user: { select: { email: true } },
      payments: { where: { month } },
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

    // Commission as main trainer — reduce by ASSISTANT_RATE if slot has an assistant
    let mainCommission = 0
    let paidBookingsCount = 0
    for (const slot of trainer.timeSlots) {
      const effectiveRate = slot.assistant ? trainer.commissionRate - ASSISTANT_RATE : trainer.commissionRate
      const slotRevenue = slot.price * slot.bookings.length
      mainCommission += Math.round(slotRevenue * effectiveRate / 100)
      paidBookingsCount += slot.bookings.length
    }

    // Commission as assistant (5% per paid booking in assisted slots)
    let assistantCommission = 0
    for (const slot of trainer.assistedSlots) {
      const slotRevenue = slot.price * slot.bookings.length
      assistantCommission += Math.round(slotRevenue * ASSISTANT_RATE / 100)
    }

    const commission = mainCommission + assistantCommission
    const revenue = trainer.timeSlots.reduce((sum, slot) => sum + slot.price * slot.bookings.length, 0)
    const accrued = BASE_SALARY + commission
    const paid = trainer.payments.reduce((sum, p) => sum + p.amount, 0)
    const balance = accrued - paid

    return {
      id: trainer.id,
      name: trainer.name,
      email: trainer.user.email,
      commissionRate: trainer.commissionRate,
      sessions,
      paidBookings: paidBookingsCount,
      revenue,
      commission,
      baseSalary: BASE_SALARY,
      accrued,
      paid,
      balance,
      payments: trainer.payments,
    }
  })

  return NextResponse.json(result)
}
