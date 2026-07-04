import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { moveClassSlot, CLASS_CANCEL_REASONS } from "@/lib/class-cancel"

// Moving a class re-sends a booking confirmation per client — needs headroom.
export const maxDuration = 60

const BodySchema = z.object({
  reason: z.enum(CLASS_CANCEL_REASONS),
  target: z.union([
    z.object({ kind: z.literal("existing"), slotId: z.string().min(1) }),
    z.object({
      kind: z.literal("new"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  ]),
})

// Trainer "can't teach this class" → move the WHOLE class to another slot
// (an existing one with room, or a new date/time created on the spot). The
// whole group transfers, clients get a fresh confirmation, the old slot
// becomes a tombstone pointing at the new one.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const slot = await prisma.timeSlot.findFirst({
    where: { id, studioId: ctx.studioId },
    select: { trainerId: true },
  })
  if (!slot) return NextResponse.json({ error: "Class not found" }, { status: 404 })
  if (slot.trainerId !== trainer.id) {
    return NextResponse.json({ error: "Not your class" }, { status: 403 })
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid move request" }, { status: 400 })
  }

  const result = await moveClassSlot({
    slotId: id,
    studioId: ctx.studioId,
    actor: {
      userId: ctx.userId,
      name: trainer.name,
      role: "trainer",
      trainerId: trainer.id,
    },
    reason: parsed.data.reason,
    // A trainer moves the class onto THEMSELVES (a new slot keeps them as the
    // trainer); handing the class to a colleague is the existing handover flow.
    target: parsed.data.target,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
