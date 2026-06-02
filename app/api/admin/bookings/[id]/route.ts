import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const UpdateSchema = z.object({
  paymentType: z.enum(["ONLINE", "OFFLINE", "PENDING"]).optional(),
  paymentStatus: z.enum(["PAID", "UNPAID"]).optional(),
  notes: z.string().optional(),
  status: z.enum(["CONFIRMED", "CANCELLED"]).optional(),
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

  // Moving to another slot: ensure the target is in this studio and not full.
  if (data.slotId && data.slotId !== existing.slotId) {
    const target = await prisma.timeSlot.findFirst({
      where: { id: data.slotId, studioId: ctx.studioId },
      include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
    })
    if (!target) return NextResponse.json({ error: "Target class not found" }, { status: 400 })
    if (target._count.bookings >= target.maxCapacity) {
      return NextResponse.json({ error: "Target class is full" }, { status: 409 })
    }
  }

  const booking = await prisma.booking.update({
    where: { id: existing.id },
    data,
    include: {
      slot: { include: { trainer: { select: { name: true } } } },
      services: { include: { service: true } },
    },
  })

  return NextResponse.json(booking)
}
