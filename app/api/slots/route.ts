import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { isSlotBookable } from "@/lib/booking-cutoff"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")
  // The booking widget passes ?studio=<slug> from the /[studio] page; falls
  // back to cookie/subdomain/default when absent.
  const studioId = await getPublicStudioId(searchParams.get("studio"))

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
      where: {
        studioId,
        date: { gte: monthStartStr, lte: maxStr },
        trainerId: { not: null }, publicVisible: true,
      },
      include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    })

    // No cutoff filter here — calendar markers (incl. past "had classes" dots)
    // need to see every slot of the month. But add a `bookable` flag so the
    // client can mark only days with bookable slots as green; otherwise a slot
    // within the 2h cutoff would show green but fail in the per-date list.
    const nowMs = Date.now()
    return NextResponse.json(
      slots.map((s) => ({
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        maxCapacity: s.maxCapacity,
        bookedCount: s._count.bookings,
        available: s._count.bookings < s.maxCapacity,
        bookable: isSlotBookable(s.date, s.startTime, nowMs),
        price: s.price,
      }))
    )
  }

  const slots = await prisma.timeSlot.findMany({
    where: { studioId, date, trainerId: { not: null }, publicVisible: true },
    include: {
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      trainer: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  })

  const nowMs = Date.now()
  const result = slots
    .filter((slot) => isSlotBookable(slot.date, slot.startTime, nowMs))
    .map((slot) => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      classType: slot.classType,
      maxCapacity: slot.maxCapacity,
      bookedCount: slot._count.bookings,
      available: slot._count.bookings < slot.maxCapacity,
      price: slot.price,
    }))

  return NextResponse.json(result)
}
