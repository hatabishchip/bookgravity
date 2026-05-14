import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const UpdateSchema = z.object({
  paymentType: z.enum(["CASH", "EDC", "QR", "TRANSFER", "PENDING"]).optional(),
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

  const updated = await prisma.booking.update({
    where: { id },
    data,
    include: { services: { include: { service: true } } },
  })

  return NextResponse.json(updated)
}
