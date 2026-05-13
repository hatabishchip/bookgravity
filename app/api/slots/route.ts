import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")

  if (!date) {
    // Return all dates that have slots within next month
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today)
    maxDate.setMonth(maxDate.getMonth() + 1)

    const todayStr = today.toISOString().split("T")[0]
    const maxStr = maxDate.toISOString().split("T")[0]

    const slots = await prisma.timeSlot.findMany({
      where: { date: { gte: todayStr, lte: maxStr } },
      include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    })

    return NextResponse.json(
      slots.map((s) => ({ ...s, available: s._count.bookings < s.maxCapacity }))
    )
  }

  const slots = await prisma.timeSlot.findMany({
    where: { date },
    include: {
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      trainer: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  })

  const result = slots.map((slot) => ({
    id: slot.id,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    maxCapacity: slot.maxCapacity,
    bookedCount: slot._count.bookings,
    available: slot._count.bookings < slot.maxCapacity,
  }))

  return NextResponse.json(result)
}
