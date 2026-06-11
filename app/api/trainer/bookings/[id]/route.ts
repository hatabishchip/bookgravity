import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  deductMembershipClass,
  restoreMembershipClass,
  getMembershipBalance,
} from "@/lib/membership"
import { notifyBookingCreated } from "@/lib/booking-notify"

// Reschedule notifications add WhatsApp round-trips beyond the 10s default.
export const maxDuration = 30

const UpdateSchema = z.object({
  paymentType: z.enum(["CASH", "EDC", "QR", "TRANSFER", "PENDING", "MEMBERSHIP"]).optional(),
  paymentStatus: z.enum(["PAID", "UNPAID"]).optional(),
  notes: z.string().optional(),
  // Move the booking to a different class/day — trainer "перенести".
  slotId: z.string().optional(),
})

const BALI_TZ = "Asia/Makassar"

function baliDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BALI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId },
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

  // Moving to another class: the target must be a future slot in this
  // studio (any class type) with a free spot. Cross-trainer targets are fine — the receiving
  // trainer is pinged below, same as for a fresh booking.
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

  // Membership handling. Deduction is trainer-only and happens here:
  //  - switching TO "MEMBERSHIP" (and not already on it) charges one class from
  //    the oldest active pass; if there's no balance we reject.
  //  - switching AWAY from a membership-paid booking gives the class back.
  const updateData: Record<string, unknown> = { ...data }
  const newType = data.paymentType
  if (newType !== undefined) {
    if (newType === "MEMBERSHIP" && booking.membershipId == null) {
      const usedId = await deductMembershipClass(ctx.studioId, booking.clientPhone)
      if (!usedId) {
        return NextResponse.json(
          { error: "no_membership_balance", message: "This client has no membership classes left." },
          { status: 400 }
        )
      }
      updateData.membershipId = usedId
      updateData.paymentStatus = "PAID"
    } else if (newType !== "MEMBERSHIP" && booking.membershipId != null) {
      // Undo a previous membership deduction.
      await restoreMembershipClass(booking.membershipId)
      updateData.membershipId = null
    }
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: updateData,
    include: { slot: true, services: { include: { service: true } } },
  })

  // Reschedule side-effects: re-send the booking confirmation (new date/time/
  // trainer) to the client and ping the receiving trainer — otherwise both
  // keep acting on the stale schedule. Mirrors the admin reschedule flow.
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
