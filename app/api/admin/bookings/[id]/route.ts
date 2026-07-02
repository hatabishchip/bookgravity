import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { afterStaffCancellation } from "@/lib/booking-cancel"
import { notifyBookingCreated } from "@/lib/booking-notify"
import { applyPaymentSwitch } from "@/lib/booking-payment"
import { zBookingPaymentType, zPaymentStatus, zBookingStatus, zPriceTier } from "@/lib/payments"
import { getMembershipBalance } from "@/lib/membership"
import { baliDateStr } from "@/lib/tz"
import { z } from "zod"

// Notifications can add a few WhatsApp round-trips beyond the 10s default.
export const maxDuration = 30

const UpdateSchema = z.object({
  // Full unified set (POS methods, MEMBERSHIP, PENDING, legacy ONLINE/OFFLINE)
  // — admins used to be locked out of membership payments entirely.
  paymentType: zBookingPaymentType.optional(),
  paymentStatus: zPaymentStatus.optional(),
  notes: z.string().optional(),
  status: zBookingStatus.optional(),
  // Indonesian local resident discount (admin/trainer ticks "Local" at payment).
  localResident: z.boolean().optional(),
  // Price tier (Full / Member / Local) — base for the 20% trainer commission.
  priceTier: zPriceTier.optional(),
  // Move the booking to a different class/day — admin "перенести".
  slotId: z.string().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const data = UpdateSchema.parse(body)

  const existing = await prisma.booking.findFirst({
    where: { id, slot: { studioId: ctx.studioId } },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // A cancelled booking is settled - block payment-type edits (switching it away
  // from MEMBERSHIP would double-restore a class afterStaffCancellation returned).
  if (existing.status === "CANCELLED" && data.paymentType !== undefined) {
    return NextResponse.json({ error: "Cannot change payment on a cancelled booking" }, { status: 400 })
  }

  // Moving to another slot: the target must be in this studio, have a trainer,
  // not be in the past, and not be full (mirrors the trainer endpoint's guards -
  // an admin move onto a past / trainer-less slot confirmed a class that can't run).
  if (data.slotId && data.slotId !== existing.slotId) {
    const target = await prisma.timeSlot.findFirst({
      where: { id: data.slotId, studioId: ctx.studioId },
      include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
    })
    if (!target) return NextResponse.json({ error: "Target class not found" }, { status: 400 })
    if (!target.trainerId) {
      return NextResponse.json({ error: "Target class has no trainer assigned" }, { status: 400 })
    }
    if (target.date < baliDateStr(new Date())) {
      return NextResponse.json({ error: "Target class is in the past" }, { status: 400 })
    }
    if (target._count.bookings >= target.maxCapacity) {
      return NextResponse.json({ error: "Target class is full" }, { status: 409 })
    }
  }

  // Membership handling: charge/refund a pass class when switching to/from
  // MEMBERSHIP (same shared rules as the trainer endpoint).
  const updateData: Record<string, unknown> = { ...data }
  // Keep the legacy localResident flag in lockstep with the tier.
  if (data.priceTier !== undefined) {
    updateData.localResident = data.priceTier === "LOCAL"
  }
  if (data.paymentType !== undefined) {
    const sw = await applyPaymentSwitch({
      studioId: ctx.studioId,
      bookingId: existing.id,
      clientPhone: existing.clientPhone,
      currentMembershipId: existing.membershipId,
      newPaymentType: data.paymentType,
      requestedPriceTier: data.priceTier,
      requestedPaymentStatus: data.paymentStatus,
    })
    if (!sw.ok) {
      return NextResponse.json(
        { error: "no_membership_balance", message: "This client has no membership classes left." },
        { status: 400 }
      )
    }
    Object.assign(updateData, sw.updateData)
  }

  // When MOVING, re-check the target capacity inside the write transaction so a
  // concurrent booking can't overbook the target between the check above and here.
  const moving = !!(data.slotId && data.slotId !== existing.slotId)
  const bookingInclude = {
    slot: { include: { trainer: { select: { name: true } } } },
    services: { include: { service: true } },
  }
  const booking = moving
    ? await prisma
        .$transaction(async (tx) => {
          const target = await tx.timeSlot.findUnique({
            where: { id: data.slotId! },
            select: { maxCapacity: true },
          })
          const count = await tx.booking.count({
            where: { slotId: data.slotId!, status: "CONFIRMED" },
          })
          if (target && count >= target.maxCapacity) throw new Error("TARGET_FULL")
          return tx.booking.update({ where: { id: existing.id }, data: updateData, include: bookingInclude })
        })
        .catch((e) => (e instanceof Error && e.message === "TARGET_FULL" ? null : Promise.reject(e)))
    : await prisma.booking.update({ where: { id: existing.id }, data: updateData, include: bookingInclude })
  if (!booking) return NextResponse.json({ error: "Target class is full" }, { status: 409 })

  // Cancellation side-effects: an admin cancel must behave like the client's
  // own WhatsApp cancel — return the membership class and tell the client.
  if (data.status === "CANCELLED" && existing.status !== "CANCELLED") {
    await afterStaffCancellation({
      id: booking.id,
      clientName: booking.clientName,
      clientPhone: booking.clientPhone,
      membershipId: booking.membershipId,
      slotId: booking.slotId,
      slot: { studioId: ctx.studioId },
    })
  }

  // Reschedule side-effects: moving to a different class re-sends the booking
  // confirmation (new date/time/trainer) to the client and pings the NEW
  // trainer — otherwise both keep acting on the stale schedule.
  if (data.slotId && data.slotId !== existing.slotId && booking.status === "CONFIRMED") {
    await notifyBookingCreated({
      studioId: ctx.studioId,
      slotId: data.slotId,
      clientName: booking.clientName,
      clientPhone: booking.clientPhone,
      leadBookingId: booking.id,
      ticketCode: booking.ticketCode,
      skipAdminAlert: true,
    })
  }

  const membershipRemaining = await getMembershipBalance(ctx.studioId, booking.clientPhone)
  return NextResponse.json({ ...booking, membershipRemaining })
}
