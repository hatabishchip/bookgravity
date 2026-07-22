import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { slotAllowsInversions, INVERSION_BLOCKED_MSG } from "@/lib/inversion-clearance"
import { notifyBookingCreated } from "@/lib/booking-notify"
import { getStudioMembershipBalances, phoneTail } from "@/lib/membership"
import { baliDateStr, addDaysStr } from "@/lib/tz"
import { generateUniqueTicketCodes } from "@/lib/tickets"
import { z } from "zod"

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")

  const bookings = await prisma.booking.findMany({
    where: {
      // Cancelled bookings must not show up in the Bookings list (or the
      // Schedule client lists) — otherwise a cancel looks like it did nothing.
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      slot: {
        studioId: ctx.studioId,
        // No explicit date → rolling window (60 days back + all future):
        // the UI's filters never look further, and an unbounded fetch was
        // growing with the studio's full booking history (audit 2026-06-12).
        ...(date ? { date } : { date: { gte: addDaysStr(baliDateStr(new Date()), -60) } }),
      },
    },
    include: {
      slot: {
        include: {
          trainer: { select: { id: true, name: true, permInvertedPositions: true } },
          assistant: { select: { permInvertedPositions: true } },
        },
      },
      services: { include: { service: true } },
      // Bank/QRIS payments linked to this booking → "confirmed by bank" badge.
      bankPayments: { select: { id: true } },
    },
    orderBy: [{ slot: { date: "asc" } }, { slot: { startTime: "asc" } }, { createdAt: "asc" }],
  })

  // Attach each client's membership balance so the admin can offer
  // "pay from membership" exactly like the trainer cabinet does.
  const balances = await getStudioMembershipBalances(ctx.studioId)
  const withBalance = bookings.map(({ bankPayments, ...b }) => ({
    ...b,
    // Inversion add-ons are offered only when the class trainer or assistant
    // holds the clearance (Sveta's rule, 16.07) - the UI hides gated chips.
    slot: { ...b.slot, allowsInversions: !!(b.slot.trainer?.permInvertedPositions || b.slot.assistant?.permInvertedPositions) },
    membershipRemaining: balances.get(phoneTail(b.clientPhone)) ?? 0,
    bankConfirmed: bankPayments.length > 0,
  }))
  return NextResponse.json(withBalance)
}

const BookingSchema = z.object({
  slotId: z.string(),
  clientName: z.string().min(1),
  clientPhone: z.string().min(3).transform((p) => p.replace(/\D/g, "")),
  clientEmail: z.string().optional(),
  clientTelegram: z.string().optional(),
  serviceIds: z.array(z.string()).optional(),
  partySize: z.number().int().min(1).max(6).default(1),
})

// Thrown inside the create transaction when a concurrent booking filled the
// last seats since our first capacity check. Caught below → 409.
class CapacityError extends Error {
  constructor(public seatsLeft: number, public requested: number) {
    super(`Only ${seatsLeft} spot(s) left, you requested ${requested}`)
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }
  const parsed = BookingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 })
  }
  const data = parsed.data

  const slot = await prisma.timeSlot.findFirst({
    where: { id: data.slotId, studioId: ctx.studioId },
    include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
  })
  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 })

  if (data.serviceIds?.length) {
    const services = await prisma.additionalService.findMany({
      where: { id: { in: data.serviceIds }, studioId: ctx.studioId },
      select: { id: true, requiresInversionClearance: true },
    })
    if (services.length !== data.serviceIds.length) {
      return NextResponse.json({ error: "Invalid service" }, { status: 400 })
    }
    // Inversion add-ons need a cleared trainer or assistant on the slot
    // (Sveta's rule, 16.07) - same gate as the public booking endpoint.
    if (services.some((s) => s.requiresInversionClearance) && !(await slotAllowsInversions(data.slotId))) {
      return NextResponse.json({ error: INVERSION_BLOCKED_MSG }, { status: 400 })
    }
  }

  const seatsLeft = slot.maxCapacity - slot._count.bookings
  if (seatsLeft < data.partySize) {
    return NextResponse.json({ error: `Only ${seatsLeft} spot(s) left, you requested ${data.partySize}` }, { status: 409 })
  }

  // Re-check capacity against a fresh count INSIDE the transaction so two
  // concurrent admin/public bookings can't both pass the check above and
  // overbook the class. Ticket codes pre-generated to stay distinct.
  const ticketCodes = await generateUniqueTicketCodes(data.slotId, data.partySize)
  type AdminBookingRow = Awaited<ReturnType<typeof prisma.booking.create>>
  let bookings: AdminBookingRow[]
  try {
    bookings = await prisma.$transaction(async (tx) => {
      const fresh = await tx.timeSlot.findUnique({
        where: { id: data.slotId },
        select: {
          maxCapacity: true,
          _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
        },
      })
      if (!fresh) throw new CapacityError(0, data.partySize)
      const freshSeatsLeft = fresh.maxCapacity - fresh._count.bookings
      if (freshSeatsLeft < data.partySize) throw new CapacityError(freshSeatsLeft, data.partySize)
      const rows: AdminBookingRow[] = []
      for (let i = 0; i < data.partySize; i++) {
        const b = await tx.booking.create({
          data: {
            slotId: data.slotId,
            clientName: data.partySize > 1 ? `${data.clientName} (${i + 1}/${data.partySize})` : data.clientName,
            clientEmail: data.clientEmail || "",
            clientPhone: data.clientPhone,
            clientTelegram: data.clientTelegram || null,
            ticketCode: ticketCodes[i],
            services: data.serviceIds?.length
              ? { create: data.serviceIds.map((sid) => ({ serviceId: sid })) }
              : undefined,
          },
          include: {
            slot: { include: { trainer: { select: { name: true } } } },
            services: { include: { service: true } },
          },
        })
        rows.push(b)
      }
      return rows
    })
  } catch (err) {
    if (err instanceof CapacityError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    throw err
  }

  // Mirror the public booking flow: open/refresh the WhatsApp conversation,
  // send the client a confirmation, and alert the trainer — so an
  // admin-created booking still shows up as a chat in the inbox. The admin
  // alert copy is skipped (the admin is the one who just booked it).
  await notifyBookingCreated({
    studioId: ctx.studioId,
    slotId: data.slotId,
    clientName: data.clientName,
    clientPhone: data.clientPhone,
    leadBookingId: bookings[0].id,
    ticketCode: bookings[0].ticketCode,
    skipAdminAlert: true,
  })

  return NextResponse.json(bookings[0], { status: 201 })
}
