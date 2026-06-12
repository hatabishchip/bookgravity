import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { getMembershipBalance } from "@/lib/membership"
import { applyPaymentSwitch } from "@/lib/booking-payment"
import { zBookingPaymentType, zPaymentStatus, zBookingStatus } from "@/lib/payments"
import { notifyBookingCreated } from "@/lib/booking-notify"
import { afterStaffCancellation } from "@/lib/booking-cancel"
import { baliDateStr } from "@/lib/tz"

// Reschedule/cancel notifications add WhatsApp round-trips beyond 10s.
export const maxDuration = 30

const UpdateSchema = z.object({
  paymentType: zBookingPaymentType.optional(),
  paymentStatus: zPaymentStatus.optional(),
  notes: z.string().optional(),
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

  // Moving to another class: the target must be a future slot in this studio
  // (any class type) with a free spot and an assigned trainer. Cross-trainer
  // targets are fine — the receiving trainer is pinged below.
  if (data.slotId && data.slotId !== booking.slotId) {
    if (booking.status !== "CONFIRMED") {
      return NextResponse.json({ error: "Only confirmed bookings can be moved" }, { status: 400 })
    }
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
  // MEMBERSHIP (shared rules with the admin endpoint).
  const updateData: Record<string, unknown> = { ...data }
  if (data.paymentType !== undefined) {
    const sw = await applyPaymentSwitch({
      studioId: ctx.studioId,
      clientPhone: booking.clientPhone,
      currentMembershipId: booking.membershipId,
      newPaymentType: data.paymentType,
    })
    if (!sw.ok) {
      return NextResponse.json(
        { error: "no_membership_balance", message: "This client has no membership classes left." },
        { status: 400 }
      )
    }
    Object.assign(updateData, sw.updateData)
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: updateData,
    include: { slot: true, services: { include: { service: true } } },
  })

  // Cancellation side-effects: behave exactly like an admin/client cancel —
  // return the membership class and notify the client.
  if (data.status === "CANCELLED" && booking.status !== "CANCELLED") {
    await afterStaffCancellation({
      id: updated.id,
      clientName: updated.clientName,
      clientPhone: updated.clientPhone,
      membershipId: updated.membershipId,
      slot: { studioId: ctx.studioId },
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
