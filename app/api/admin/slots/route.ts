import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { syncSlotToGoogle, unsyncSlotFromGoogle } from "@/lib/google-calendar"
import { restoreMembershipsForBookings } from "@/lib/booking-cancel"
import { sendPush } from "@/lib/expo-push"
import { format, parseISO } from "date-fns"

// Google Calendar sync can add a few network calls per slot; give the function
// headroom past the 10s default (no-ops instantly when not connected).
export const maxDuration = 60

const CLASS_DURATION_MIN = 120
const MIN_GAP_MIN = 0
const MAX_SLOTS_PER_DAY = 7

// Delete a slot together with any leftover bookings that still reference it.
// Booking → TimeSlot is ON DELETE RESTRICT, so even a CANCELLED booking blocks
// the delete (a plain timeSlot.delete then 500s). Callers must ensure there are
// no CONFIRMED bookings first; this clears the remaining (cancelled) rows +
// their services, then removes the slot.
async function deleteSlotCascade(slotId: string) {
  const bookings = await prisma.booking.findMany({
    where: { slotId },
    select: { id: true, status: true, membershipId: true },
  })
  // A membership-paid booking still CONFIRMED at delete time would silently
  // eat the client's class — give it back before the rows vanish. (CANCELLED
  // ones were already restored when they were cancelled.)
  await restoreMembershipsForBookings(bookings.filter((b) => b.status === "CONFIRMED"))
  const ids = bookings.map((b) => b.id)
  if (ids.length) {
    await prisma.bookingService.deleteMany({ where: { bookingId: { in: ids } } })
    await prisma.booking.deleteMany({ where: { id: { in: ids } } })
  }
  // Remove the matching Google Calendar event first (best-effort).
  await unsyncSlotFromGoogle(slotId).catch(() => {})
  await prisma.timeSlot.delete({ where: { id: slotId } })
}

function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function minToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

const trainerSelect = { id: true, name: true, color: true }
const slotInclude = {
  trainer: { select: trainerSelect },
  assistant: { select: trainerSelect },
  _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
}

const SlotSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  trainerId: z.string().optional(),
  assistantId: z.string().nullable().optional(),
  classType: z.enum(["GROUP", "KIDS", "PRIVATE"]).default("GROUP"),
  publicVisible: z.boolean().optional(),
  maxCapacity: z.number().min(1).max(6).default(6),
  price: z.number().min(0).default(0),
  // When true, also create copies of this slot for the next N Tuesdays
  // (or whatever weekday `date` falls on). Skips dates that conflict.
  repeatWeekly: z.boolean().optional(),
})

const REPEAT_WEEKS = 12 // how many future weeks to schedule when repeatWeekly is true

function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const slots = await prisma.timeSlot.findMany({
    where: {
      studioId: ctx.studioId,
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
      // Cancelled classes are tombstones — hiding them here keeps the
      // day-editor's per-time rows consistent and lets the admin create a
      // replacement class at the same time.
      cancelledAt: null,
    },
    include: slotInclude,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })

  return NextResponse.json(slots)
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const data = SlotSchema.parse(body)

    const startMin = timeToMin(data.startTime)
    const endMin = startMin + CLASS_DURATION_MIN
    const endTime = minToTime(endMin)

    const existingSlots = await prisma.timeSlot.findMany({ where: { date: data.date, studioId: ctx.studioId } })

    // Max 7 sessions per day
    if (existingSlots.length >= MAX_SLOTS_PER_DAY) {
      return NextResponse.json(
        { error: `Maximum ${MAX_SLOTS_PER_DAY} sessions per day reached.` },
        { status: 409 }
      )
    }

    // Gap check
    for (const slot of existingSlots) {
      const exStart = timeToMin(slot.startTime)
      const exEnd = timeToMin(slot.endTime)
      if (startMin < exEnd + MIN_GAP_MIN && exStart < endMin + MIN_GAP_MIN) {
        return NextResponse.json(
          { error: `Conflicts with session at ${slot.startTime}-${slot.endTime}. Min 30-min gap required.` },
          { status: 409 }
        )
      }
    }

    // Check if day is blocked
    const blocked = await prisma.blockedDay.findFirst({ where: { date: data.date, studioId: ctx.studioId } })
    if (blocked) {
      return NextResponse.json(
        { error: `${data.date} is blocked${blocked.reason ? ": " + blocked.reason : ""}. Unblock the day first.` },
        { status: 409 }
      )
    }

    // Don't create a class over a sublet block - the room is already rented out
    // for that window (the studio-sublet service holds it).
    const subletBlocks = await prisma.studioBlock.findMany({ where: { date: data.date, studioId: ctx.studioId } })
    for (const blk of subletBlocks) {
      const bStart = timeToMin(blk.startTime)
      const bEnd = timeToMin(blk.endTime)
      if (startMin < bEnd && bStart < endMin) {
        return NextResponse.json(
          { error: `Conflicts with a sublet booking at ${blk.startTime}-${blk.endTime}${blk.label ? ` (${blk.label})` : ""}.` },
          { status: 409 }
        )
      }
    }

    // Private session is always max 1 person
    const finalCapacity = data.classType === "PRIVATE" ? 1 : data.maxCapacity

    // Strip out repeatWeekly before passing through to Prisma; assign a
    // seriesId only when we're actually scheduling future weeks.
    const { repeatWeekly, ...slotData } = data
    const seriesId = repeatWeekly ? `srs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` : null

    const slot = await prisma.timeSlot.create({
      data: {
        ...slotData,
        maxCapacity: finalCapacity,
        endTime,
        studioId: ctx.studioId,
        ...(seriesId ? { seriesId } : {}),
      },
      include: slotInclude,
    })
    const createdIds: string[] = [slot.id]

    // Schedule future weekly repeats. Each candidate week is independently
    // validated (gap check + blocked-day check + per-day cap). Any that fail
    // are silently skipped so a partial run still succeeds.
    const skipped: { date: string; reason: string }[] = []
    if (repeatWeekly && seriesId) {
      for (let w = 1; w <= REPEAT_WEEKS; w++) {
        const nextDate = addDaysISO(data.date, 7 * w)

        const blockedNext = await prisma.blockedDay.findFirst({ where: { date: nextDate, studioId: ctx.studioId } })
        if (blockedNext) { skipped.push({ date: nextDate, reason: "day blocked" }); continue }

        const otherSlots = await prisma.timeSlot.findMany({ where: { date: nextDate, studioId: ctx.studioId } })
        if (otherSlots.length >= MAX_SLOTS_PER_DAY) { skipped.push({ date: nextDate, reason: "max sessions" }); continue }
        const conflict = otherSlots.find((s) => {
          const exStart = timeToMin(s.startTime), exEnd = timeToMin(s.endTime)
          return startMin < exEnd + MIN_GAP_MIN && exStart < endMin + MIN_GAP_MIN
        })
        if (conflict) { skipped.push({ date: nextDate, reason: `conflicts with ${conflict.startTime}` }); continue }

        const rep = await prisma.timeSlot.create({
          data: {
            ...slotData,
            date: nextDate,
            maxCapacity: finalCapacity,
            endTime,
            studioId: ctx.studioId,
            seriesId,
          },
        })
        createdIds.push(rep.id)
      }
    }

    // Push every created class to the studio's Google Calendar (if connected).
    await Promise.allSettled(createdIds.map((id) => syncSlotToGoogle(id)))

    return NextResponse.json({ ...slot, _seriesSkipped: skipped }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  try {
    const body = await request.json()
    const data = z.object({
      startTime: z.string().optional(),
      trainerId: z.string().nullable().optional(),
      assistantId: z.string().nullable().optional(),
      classType: z.enum(["GROUP", "KIDS", "PRIVATE"]).optional(),
      publicVisible: z.boolean().optional(),
      maxCapacity: z.number().min(1).max(6).optional(),
      price: z.number().min(0).optional(),
      // When true, also delete every FUTURE slot in this slot's series
      // (date > current.date). Bookings block individual deletions; days that
      // can't be removed are reported back as skipped instead of failing.
      endSeries: z.boolean().optional(),
      // When true on a slot with NO series yet: start one - create the next
      // REPEAT_WEEKS weekly occurrences (same per-week validation as POST).
      // Before 2026-07-02 the checkbox on an existing slot was a silent no-op:
      // the client sent nothing and the admin believed 12 weeks were scheduled.
      repeatWeekly: z.boolean().optional(),
      // When true on a slot that IS part of a series: copy the edited fields
      // to every FUTURE occurrence too (Sveta 20.07.2026 - edits applied to
      // one day only, future weeks silently kept the old settings and had to
      // be re-checked by hand).
      applyToSeries: z.boolean().optional(),
    }).parse(body)

    // Force capacity to 1 when type becomes PRIVATE
    if (data.classType === "PRIVATE") data.maxCapacity = 1

    const current = await prisma.timeSlot.findFirst({ where: { id, studioId: ctx.studioId } })
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Recompute end time + check conflicts only if startTime is changing
    let newStartTime: string | undefined
    let newEndTime: string | undefined
    if (data.startTime && data.startTime !== current.startTime) {
      newStartTime = data.startTime
      const startMin = timeToMin(newStartTime)
      const endMin = startMin + CLASS_DURATION_MIN
      newEndTime = minToTime(endMin)

      const siblings = await prisma.timeSlot.findMany({
        where: { date: current.date, studioId: ctx.studioId, NOT: { id } },
      })
      for (const slot of siblings) {
        const exStart = timeToMin(slot.startTime)
        const exEnd = timeToMin(slot.endTime)
        if (startMin < exEnd + MIN_GAP_MIN && exStart < endMin + MIN_GAP_MIN) {
          return NextResponse.json(
            { error: `Conflicts with session at ${slot.startTime}-${slot.endTime}. Min 30-min gap required.` },
            { status: 409 }
          )
        }
      }
    }

    const updated = await prisma.timeSlot.update({
      where: { id: current.id },
      data: {
        ...(newStartTime !== undefined && { startTime: newStartTime, endTime: newEndTime! }),
        ...(data.trainerId !== undefined && { trainerId: data.trainerId ?? null }),
        ...(data.assistantId !== undefined && { assistantId: data.assistantId ?? null }),
        ...(data.classType !== undefined && { classType: data.classType }),
        ...(data.publicVisible !== undefined && { publicVisible: data.publicVisible }),
        ...(data.maxCapacity !== undefined && { maxCapacity: data.maxCapacity }),
        ...(data.price !== undefined && { price: data.price }),
      },
      include: slotInclude,
    })

    // Copy the edited fields to all FUTURE occurrences of the series. Capacity
    // never shrinks below the seats already booked on a given week; startTime
    // deliberately does not propagate (a time change is a per-day decision).
    let seriesApplied = 0
    if (data.applyToSeries && current.seriesId && !data.endSeries) {
      const futures = await prisma.timeSlot.findMany({
        where: {
          seriesId: current.seriesId,
          studioId: ctx.studioId,
          date: { gt: current.date },
          cancelledAt: null,
        },
        select: {
          id: true,
          _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
        },
      })
      for (const f of futures) {
        await prisma.timeSlot.update({
          where: { id: f.id },
          data: {
            ...(data.trainerId !== undefined && { trainerId: data.trainerId ?? null }),
            ...(data.assistantId !== undefined && { assistantId: data.assistantId ?? null }),
            ...(data.classType !== undefined && { classType: data.classType }),
            ...(data.publicVisible !== undefined && { publicVisible: data.publicVisible }),
            ...(data.maxCapacity !== undefined && { maxCapacity: Math.max(data.maxCapacity, f._count.bookings) }),
            ...(data.price !== undefined && { price: data.price }),
          },
        })
        seriesApplied++
      }
    }

    // Newly assigned an assistant to this class? Ping them so they know to come
    // help (they don't book it themselves). Fire-and-forget; never block the save.
    if (data.assistantId && data.assistantId !== current.assistantId) {
      void (async () => {
        const assistant = await prisma.trainer.findUnique({
          where: { id: data.assistantId! },
          select: { userId: true },
        })
        if (!assistant?.userId) return
        let dateLabel = updated.date
        try { dateLabel = format(parseISO(updated.date), "EEE, MMM d") } catch {}
        await sendPush({
          userId: assistant.userId,
          title: "You're assisting a class",
          body: `${dateLabel} at ${updated.startTime}`,
          category: "booking",
          data: { category: "booking", slotId: updated.id },
        })
      })().catch(() => {})
    }

    // If the admin un-checks "Repeat weekly" on this slot, strip the series
    // from future occurrences and delete the ones with no bookings. Past +
    // current slot keep their seriesId so history is preserved.
    let seriesEnded: { deleted: number; kept: number } | undefined
    if (data.endSeries && current.seriesId) {
      const futures = await prisma.timeSlot.findMany({
        where: {
          studioId: ctx.studioId,
          seriesId: current.seriesId,
          date: { gt: current.date },
        },
        // ANY booking rows (incl. CANCELLED) = history worth keeping — hard
        // delete would cascade those rows away and erase the audit trail.
        include: { _count: { select: { bookings: true } } },
      })
      let deleted = 0, kept = 0
      for (const f of futures) {
        if (f._count.bookings > 0) {
          // Keep it, but detach from the series so it won't be re-trimmed later
          await prisma.timeSlot.update({ where: { id: f.id }, data: { seriesId: null } })
          kept++
        } else {
          await deleteSlotCascade(f.id)
          deleted++
        }
      }
      // Detach current slot too so the series is fully closed
      await prisma.timeSlot.update({ where: { id: current.id }, data: { seriesId: null } })
      seriesEnded = { deleted, kept }
    }

    // Admin ticked "Repeat weekly" on an EXISTING slot with no series: start
    // one now - create the forward weekly occurrences with the same per-week
    // validation the POST path uses (blocked days, day cap, min gap).
    let seriesStarted: { created: number; skipped: { date: string; reason: string }[] } | undefined
    if (data.repeatWeekly && !current.seriesId && !data.endSeries) {
      const seriesId = `srs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const startMin = timeToMin(updated.startTime)
      const endMin = timeToMin(updated.endTime)
      const createdIds: string[] = []
      const skipped: { date: string; reason: string }[] = []
      for (let w = 1; w <= REPEAT_WEEKS; w++) {
        const nextDate = addDaysISO(updated.date, 7 * w)
        const blockedNext = await prisma.blockedDay.findFirst({ where: { date: nextDate, studioId: ctx.studioId } })
        if (blockedNext) { skipped.push({ date: nextDate, reason: "day blocked" }); continue }
        const otherSlots = await prisma.timeSlot.findMany({ where: { date: nextDate, studioId: ctx.studioId } })
        if (otherSlots.length >= MAX_SLOTS_PER_DAY) { skipped.push({ date: nextDate, reason: "max sessions" }); continue }
        if (otherSlots.some((s) => timeToMin(s.startTime) < endMin + MIN_GAP_MIN && startMin < timeToMin(s.endTime) + MIN_GAP_MIN)) {
          skipped.push({ date: nextDate, reason: "time conflict" }); continue
        }
        const rep = await prisma.timeSlot.create({
          data: {
            date: nextDate,
            startTime: updated.startTime,
            endTime: updated.endTime,
            classType: updated.classType,
            publicVisible: updated.publicVisible,
            trainerId: updated.trainerId,
            assistantId: updated.assistantId,
            maxCapacity: updated.maxCapacity,
            price: updated.price,
            studioId: ctx.studioId,
            seriesId,
          },
        })
        createdIds.push(rep.id)
      }
      await prisma.timeSlot.update({ where: { id: current.id }, data: { seriesId } })
      await Promise.allSettled(createdIds.map((cid) => syncSlotToGoogle(cid)))
      seriesStarted = { created: createdIds.length, skipped }
    }

    // Reflect the edit in Google Calendar (best-effort, no-op if not connected).
    await syncSlotToGoogle(current.id).catch(() => {})

    return NextResponse.json({ ...updated, _seriesEnded: seriesEnded, _seriesStarted: seriesStarted, _seriesApplied: seriesApplied || undefined })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  // Block delete if the slot has ANY booking history. Deleting used to cascade
  // away even CANCELLED rows — that's how the 04.07 incident erased a booking
  // without a trace. A class that had clients is cancelled (kept as a
  // tombstone with notifications + refunds), never deleted; only never-booked
  // slots can be removed outright.
  const slot = await prisma.timeSlot.findFirst({
    where: { id, studioId: ctx.studioId },
    include: { _count: { select: { bookings: true } } },
  })
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (slot._count.bookings > 0) {
    return NextResponse.json(
      { error: "This class has booking history. Use \"Cancel class\" instead - clients get notified, passes are returned and the class stays in the records." },
      { status: 409 },
    )
  }

  try {
    await deleteSlotCascade(slot.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[slots/DELETE] failed:", err)
    return NextResponse.json({ error: "Couldn't delete the session. Please try again." }, { status: 500 })
  }
}
