import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { phoneTail } from "@/lib/membership"

// GET /api/whatsapp/conversations
// Admin: all conversations in their studio.
// Trainer: only conversations where assignedTrainerId == them.
export async function GET(_req: NextRequest) {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Per-studio gate.
  if (!(await isStudioWhatsAppEnabled(ctx.studioId))) {
    return NextResponse.json({ error: "WhatsApp not enabled for this studio" }, { status: 403 })
  }

  let trainerId: string | null = null
  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })
    trainerId = trainer.id
  }

  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      studioId: ctx.studioId,
      // Trainer sees a chat if they're in the access list (populated by every
      // booking they were the trainer for). Admin sees everything.
      ...(ctx.role === "TRAINER"
        ? { access: { some: { trainerId: trainerId! } } }
        : {}),
    },
    include: {
      assignedTrainer: { select: { id: true, name: true, color: true } },
      // All trainers who can see this chat — shown as colored dots in admin.
      access: {
        include: { trainer: { select: { id: true, name: true, color: true } } },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
  })

  // For each client, the date+time of their LATEST class by class date:
  //  - a future booking (the one they're booked onto next) wins, since it has
  //    the latest date;
  //  - if there's no future booking (or it was cancelled), this is the last
  //    class they actually had;
  //  - clients who only chat and never booked have nothing → null.
  // Matched by phone tail (conversations store Meta digits, bookings store a
  // formatted number).
  const confirmed = await prisma.booking.findMany({
    where: { status: "CONFIRMED", slot: { studioId: ctx.studioId } },
    select: { clientPhone: true, slot: { select: { date: true, startTime: true, endTime: true } } },
  })
  type Slot = { date: string; startTime: string; endTime: string }
  const sortKey = (s: Slot) => `${s.date}T${s.startTime}`
  const lastClassByTail = new Map<string, Slot>()
  for (const b of confirmed) {
    const tail = phoneTail(b.clientPhone)
    if (!tail) continue
    const cur = lastClassByTail.get(tail)
    if (!cur || sortKey(b.slot) > sortKey(cur)) lastClassByTail.set(tail, b.slot)
  }

  return NextResponse.json(
    conversations.map((c) => ({
      lastClass: lastClassByTail.get(phoneTail(c.clientPhone)) ?? null,
      id: c.id,
      clientPhone: c.clientPhone,
      clientName: c.clientName,
      assignedTrainer: c.assignedTrainer,
      accessTrainers: c.access.map((a) => a.trainer),
      lastMessageAt: c.lastMessageAt,
      lastInboundAt: c.lastInboundAt,
      unread: ctx.role === "ADMIN" ? c.unreadAdmin : c.unreadTrainer,
      lastMessage: c.messages[0]
        ? {
            id: c.messages[0].id,
            direction: c.messages[0].direction,
            type: c.messages[0].type,
            // Prefer the translation for the sidebar preview so admins
            // see the snippet in their language.
            body: c.messages[0].translatedBody ?? c.messages[0].body,
            createdAt: c.messages[0].createdAt,
          }
        : null,
    })),
  )
}
