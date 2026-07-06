import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { getMembershipBalance } from "@/lib/membership"
import { applyPaymentSwitch } from "@/lib/booking-payment"
import { zBookingPaymentType, zPaymentStatus, zBookingStatus, zPriceTier } from "@/lib/payments"
import { notifyBookingCreated } from "@/lib/booking-notify"
import { afterStaffCancellation } from "@/lib/booking-cancel"
import { baliDateStr } from "@/lib/tz"

// Reschedule/cancel notifications add WhatsApp round-trips beyond 10s.
export const maxDuration = 30

const UpdateSchema = z.object({
  paymentType: zBookingPaymentType.optional(),
  paymentStatus: zPaymentStatus.optional(),
  notes: z.string().optional(),
  // Indonesian local resident discount (trainer ticks "Local" at payment).
  localResident: z.boolean().optional(),
  // Price tier the coach marks (Full / Member / Local) — drives the 20% base.
  priceTier: zPriceTier.optional(),
  // Cancel — same side-effects as the admin cancel (membership restore +
  // client notification via afterStaffCancellation).
  status: zBookingStatus.optional(),
  // Move the booking to a different class/day — trainer "перенести".
  slotId: z.string().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const booking = await prisma.booking.findFirst({
    where: { id, slot: { studioId: ctx.studioId } },
    include: { slot: true },
  })
  if (!booking || booking.slot.trainerId !== trainer.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await request.json()
  const data = UpdateSchema.parse(body)

  // A cancelled booking is settled - block payment-type edits on it, otherwise
  // switching it away from MEMBERSHIP would restore a class that afterStaff-
  // Cancellation already returned (double-restore).
  if (booking.status === "CANCELLED" && data.paymentType !== undefined) {
    return NextResponse.json({ error: "Cannot change payment on a cancelled booking" }, { status: 400 })
  }

  // Moving to another class: the target must be a future slot in this studio
  // (any class type) with a free spot and an assigned trainer. Cross-trainer
  // targets are fine — the receiving trainer is pinged below.
  if (data.slotId && data.slotId !== booking.slotId) {
    if (booking.status !== "CONFIRMED") {
      return NextResponse.json({ error: "Only confirmed bookings can be moved" }, { status: 400 })
    }
    const target = await prisma.timeSlot.findFirst({
      // cancelledAt: a cancelled class is not a valid destination.
      where: { id: data.slotId, studioId: ctx.studioId, cancelledAt: null },
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
  // MEMBERSHIP (shared rules with the admin endpoint).
  const updateData: Record<string, unknown> = { ...data }
  // Keep the legacy localResident flag in sync with the tier so any older UI
  // that still reads it stays correct (LOCAL ⇒ true, FULL/MEMBER ⇒ false).
  if (data.priceTier !== undefined) {
    updateData.localResident = data.priceTier === "LOCAL"
  }
  // Cancellation attribution: record who flipped it and when (the 04.07
  // incident could not name the actor because nothing wrote this down).
  if (data.status === "CANCELLED" && booking.status !== "CANCELLED") {
    updateData.cancelledAt = new Date()
    updateData.cancelledByUserId = ctx.userId
    updateData.cancelledByRole = "trainer"
  }
  // Payment attribution: whoever records the payment took the money — for a
  // CASH payment this decides whose safe the bills are counted in.
  if (data.paymentType !== undefined || data.paymentStatus !== undefined) {
    updateData.paymentMarkedByUserId = ctx.userId
  }
  if (data.paymentType !== undefined) {
    const sw = await applyPaymentSwitch({
      studioId: ctx.studioId,
      bookingId: booking.id,
      clientPhone: booking.clientPhone,
      currentMembershipId: booking.membershipId,
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

  // Apply the update. When MOVING to another slot, re-check the target's
  // capacity inside the same transaction (the earlier check was a plain read -
  // a concurrent booking could have taken the last seat = overbook).
  const moving = !!(data.slotId && data.slotId !== booking.slotId)
  const updated = moving
    ? await prisma
        .$transaction(async (tx) => {
          const target = await tx.timeSlot.findUnique({
            where: { id: data.slotId! },
            select: { maxCapacity: true },
          })
          const others = await tx.booking.findMany({
            where: { slotId: data.slotId!, status: "CONFIRMED" },
            select: { ticketCode: true },
          })
          if (target && others.length >= target.maxCapacity) throw new Error("TARGET_FULL")
          // Ticket codes are unique per SLOT at creation only - a moved booking
          // carries its old code, which may already exist in the target class
          // (two clients, one door code = check-in/cancel-bot ambiguity).
          // Regenerate on collision; the re-sent confirmation carries the new one.
          const taken = new Set(others.map((b) => b.ticketCode))
          let codePatch: { ticketCode?: string } = {}
          if (taken.has(booking.ticketCode)) {
            let c = booking.ticketCode
            do { c = String(Math.floor(100 + Math.random() * 900)) } while (taken.has(c))
            codePatch = { ticketCode: c }
          }
          return tx.booking.update({
            where: { id },
            data: { ...updateData, ...codePatch },
            include: { slot: true, services: { include: { service: true } } },
          })
        })
        .catch((e) => (e instanceof Error && e.message === "TARGET_FULL" ? null : Promise.reject(e)))
    : await prisma.booking.update({
        where: { id },
        data: updateData,
        include: { slot: true, services: { include: { service: true } } },
      })
  if (!updated) return NextResponse.json({ error: "Target class is full" }, { status: 409 })

  // Cancellation side-effects: behave exactly like an admin/client cancel —
  // return the membership class and notify the client.
  if (data.status === "CANCELLED" && booking.status !== "CANCELLED") {
    await afterStaffCancellation({
      id: updated.id,
      clientName: updated.clientName,
      clientPhone: updated.clientPhone,
      membershipId: updated.membershipId,
      slotId: updated.slotId,
      slot: { studioId: ctx.studioId },
      cancelledByTrainerId: trainer.id,
    })
  }

  // Reschedule side-effects: re-send the booking confirmation (new date/time/
  // trainer) to the client and ping the receiving trainer.
  if (data.slotId && data.slotId !== booking.slotId && updated.status === "CONFIRMED") {
    await notifyBookingCreated({
      studioId: ctx.studioId,
      slotId: data.slotId,
      clientName: updated.clientName,
      clientPhone: updated.clientPhone,
      leadBookingId: updated.id,
      ticketCode: updated.ticketCode,
      skipAdminAlert: true,
    })
  }

  const membershipRemaining = await getMembershipBalance(ctx.studioId, updated.clientPhone)

  return NextResponse.json({ ...updated, membershipRemaining })
}
