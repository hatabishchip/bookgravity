import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getDefaultStudioId } from "@/lib/studio"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")
  const studioId = await getDefaultStudioId()

  if (!date) {
    // Return all dates that have slots from the start of the current month to one month ahead.
    // Past dates of this month are included so the calendar can mark days that had classes.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const maxDate = new Date(today)
    maxDate.setMonth(maxDate.getMonth() + 1)

    const monthStartStr = monthStart.toISOString().split("T")[0]
    const maxStr = maxDate.toISOString().split("T")[0]

    const slots = await prisma.timeSlot.findMany({
      where: { studioId, date: { gte: monthStartStr, lte: maxStr } },
      include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    })

    return NextResponse.json(
      slots.map((s) => ({
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        maxCapacity: s.maxCapacity,
        bookedCount: s._count.bookings,
        available: s._count.bookings < s.maxCapacity,
        price: s.price,
      }))
    )
  }

  const slots = await prisma.timeSlot.findMany({
    where: { studioId, date },
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
    price: slot.price,
  }))

  return NextResponse.json(result)
}
