import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { cancelClassSlot, CLASS_CANCEL_REASONS } from "@/lib/class-cancel"

// Cancelling a class fans out one WhatsApp template per booked client plus a
// staff alert — give it headroom past the 10s default.
export const maxDuration = 60

const BodySchema = z.object({
  reason: z.enum(CLASS_CANCEL_REASONS),
})

// Trainer "can't teach this class" → cancel the WHOLE class: every confirmed
// booking is cancelled with attribution, memberships restored, every client
// notified via an approved template, the slot becomes a tombstone.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  // A trainer may only cancel their OWN class.
  const slot = await prisma.timeSlot.findFirst({
    where: { id, studioId: ctx.studioId },
    select: { trainerId: true },
  })
  if (!slot) return NextResponse.json({ error: "Class not found" }, { status: 404 })
  if (slot.trainerId !== trainer.id) {
    return NextResponse.json({ error: "Not your class" }, { status: 403 })
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a cancellation reason" }, { status: 400 })
  }

  const result = await cancelClassSlot({
    slotId: id,
    studioId: ctx.studioId,
    actor: {
      userId: ctx.userId,
      name: trainer.name,
      role: "trainer",
      trainerId: trainer.id,
    },
    reason: parsed.data.reason,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
