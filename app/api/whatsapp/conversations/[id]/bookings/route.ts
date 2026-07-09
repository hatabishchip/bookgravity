import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { phoneTail } from "@/lib/membership"
import { baliDateStr } from "@/lib/tz"

// GET /api/whatsapp/conversations/[id]/bookings
// Backs the chat composer's "class action" button: the client's upcoming
// CONFIRMED bookings so staff can move or cancel a class without leaving the
// conversation. Same phone-tail matching as the conversation-list badges.
// `studioSlug` lets the UI gate the button per studio (Canggu-only rollout).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const convo = await prisma.whatsAppConversation.findFirst({
    where: { id, studioId: ctx.studioId },
    select: { clientPhone: true },
  })
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { slug: true },
  })

  let trainer: { id: string; permManageBookings: boolean } | null = null
  if (ctx.role === "TRAINER") {
    trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true, permManageBookings: true },
    })
    if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })
  }

  const tail = phoneTail(convo.clientPhone)
  if (tail.length < 6) {
    return NextResponse.json({ studioSlug: studio?.slug ?? null, bookings: [] })
  }

  // Phones are stored in mixed formats, so match by canonical tail in memory
  // over the studio's upcoming slate (small: days x classes x <=6 people).
  const today = baliDateStr(new Date())
  const rows = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      slot: { studioId: ctx.studioId, date: { gte: today }, cancelledAt: null },
    },
    include: { slot: { include: { trainer: { select: { id: true, name: true } } } } },
    orderBy: [{ slot: { date: "asc" } }, { slot: { startTime: "asc" } }],
    take: 600,
  })

  const bookings = rows
    .filter((b) => phoneTail(b.clientPhone) === tail)
    .map((b) => ({
      id: b.id,
      slotId: b.slotId,
      date: b.slot.date,
      startTime: b.slot.startTime,
      endTime: b.slot.endTime,
      classType: b.slot.classType,
      trainerName: b.slot.trainer?.name ?? null,
      // Mirrors the trainer PATCH rule: own class or delegated rights.
      canManage: !trainer || b.slot.trainerId === trainer.id || trainer.permManageBookings,
    }))

  return NextResponse.json({ studioSlug: studio?.slug ?? null, bookings })
}
