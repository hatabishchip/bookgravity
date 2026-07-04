import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { cancelClassSlot, CLASS_CANCEL_REASONS } from "@/lib/class-cancel"

export const maxDuration = 60

const BodySchema = z.object({
  reason: z.enum(CLASS_CANCEL_REASONS),
})

// Admin cancels a whole class (e.g. the trainer called in sick by phone):
// same flow as the trainer's own button — bookings cancelled with attribution,
// memberships restored, clients notified, slot tombstoned. The slot's trainer
// gets a staff alert too (someone else cancelled their class).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a cancellation reason" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { name: true, email: true },
  })

  const result = await cancelClassSlot({
    slotId: id,
    studioId: ctx.studioId,
    actor: {
      userId: ctx.userId,
      name: user?.name?.trim() || user?.email || "Admin",
      role: "admin",
    },
    reason: parsed.data.reason,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
