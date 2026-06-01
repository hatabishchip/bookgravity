import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  deductMembershipClass,
  restoreMembershipClass,
  getMembershipBalance,
} from "@/lib/membership"

const UpdateSchema = z.object({
  paymentType: z.enum(["CASH", "EDC", "QR", "TRANSFER", "PENDING", "MEMBERSHIP"]).optional(),
  paymentStatus: z.enum(["PAID", "UNPAID"]).optional(),
  notes: z.string().optional(),
})

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
    include: { services: { include: { service: true } } },
  })

  const membershipRemaining = await getMembershipBalance(ctx.studioId, updated.clientPhone)

  return NextResponse.json({ ...updated, membershipRemaining })
}
