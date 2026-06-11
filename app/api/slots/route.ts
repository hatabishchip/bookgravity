import { NextRequest, NextResponse, after } from "next/server"
import { maybeRunTodayReminders } from "@/lib/reminder-tick"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { isSlotBookableWithAttendees, slotStartMs, slotEndMs } from "@/lib/booking-cutoff"

export async function GET(request: NextRequest) {
  // Traffic-driven fallback for the same-day reminder job: every widget visit
  // gives it one cheap, rate-limited chance to run AFTER the response is sent
  // (GitHub's cron pinger can lag hours — see lib/reminder-tick.ts).
  after(() => maybeRunTodayReminders())

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")
  // The booking widget passes ?studio=<slug> from the /[studio] page; falls
  // back to cookie/subdomain/default when absent.
  const studioId = await getPublicStudioId(searchParams.get("studio"))

  if (!date) {
    // Return all dates that have slots from the start of the current month
    // through several months ahead. The widget shows the nearest TWO months
    // that actually have bookable classes — which may be next month + the one
    // after if the current month is empty — so we need a wide enough window to
    // find them. Past dates of this month are included so the calendar can
    // still mark days that had classes.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const maxDate = new Date(today)
    maxDate.setMonth(maxDate.getMonth() + 4)

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
        // A class with ≥1 attendee stays bookable until it ends; an empty one
        // uses the 2h cutoff.
        bookable: isSlotBookableWithAttendees(s.date, s.startTime, s.endTime, s._count.bookings, nowMs),
        // Class already finished — lets the widget keep an in-progress class
        // visible (greyed) but hide ones that are fully over.
        ended: slotEndMs(s.date, s.endTime) <= nowMs,
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

  // Show every slot for the day, including ones now inside the 2-hour cutoff.
  // Those come back with bookable:false so the widget can render them greyed
  // out ("contact us") instead of hiding them — a client can still see the
  // class exists and reach out if a trainer can make it. Slots whose start is
  // already in the past are dropped entirely (nothing to contact about).
  const nowMs = Date.now()
  const result = slots
    // Keep in-progress classes visible; drop only fully-finished ones.
    .filter((slot) => slotEndMs(slot.date, slot.endTime) > nowMs)
    .map((slot) => ({
      id: slot.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      classType: slot.classType,
      maxCapacity: slot.maxCapacity,
      bookedCount: slot._count.bookings,
      available: slot._count.bookings < slot.maxCapacity,
      // Outside the 2h cutoff, OR (with ≥1 attendee) any time before it ends.
      bookable: isSlotBookableWithAttendees(slot.date, slot.startTime, slot.endTime, slot._count.bookings, nowMs),
      // Class is currently running (started but not yet finished).
      started: slotStartMs(slot.date, slot.startTime) <= nowMs,
      price: slot.price,
    }))

  return NextResponse.json(result)
}
