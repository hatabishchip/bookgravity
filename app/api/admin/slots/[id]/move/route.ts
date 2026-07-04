import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { moveClassSlot, CLASS_CANCEL_REASONS } from "@/lib/class-cancel"

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
      // Admin may hand the moved class to a different trainer (a cover).
      trainerId: z.string().optional(),
    }),
  ]),
})

// Admin moves a whole class to another slot or a new date/time, optionally
// onto a covering trainer. Same engine as the trainer's button.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid move request" }, { status: 400 })
  }

  // A covering trainer must belong to this studio.
  if (parsed.data.target.kind === "new" && parsed.data.target.trainerId) {
    const cover = await prisma.trainer.findFirst({
      where: { id: parsed.data.target.trainerId, studioId: ctx.studioId, archived: false },
      select: { id: true },
    })
    if (!cover) return NextResponse.json({ error: "Cover trainer not found" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { name: true, email: true },
  })

  const result = await moveClassSlot({
    slotId: id,
    studioId: ctx.studioId,
    actor: {
      userId: ctx.userId,
      name: user?.name?.trim() || user?.email || "Admin",
      role: "admin",
    },
    reason: parsed.data.reason,
    target: parsed.data.target,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
