import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const UpdateSchema = z.object({
  paymentType: z.enum(["CASH", "EDC", "QR", "TRANSFER", "PENDING"]).optional(),
  paymentStatus: z.enum(["PAID", "UNPAID"]).optional(),
  notes: z.string().optional(),
})

async function requireTrainer() {
  const session = await auth()
  if (!session || session.user.role !== "TRAINER") return null
  return session
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireTrainer()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const trainer = await prisma.trainer.findUnique({ where: { userId: session.user.id } })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const booking = await prisma.booking.findUnique({
    where: { id },
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
