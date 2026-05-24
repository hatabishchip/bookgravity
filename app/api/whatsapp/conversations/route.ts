import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"

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
      ...(ctx.role === "TRAINER" ? { assignedTrainerId: trainerId! } : {}),
    },
    include: {
      assignedTrainer: { select: { id: true, name: true, color: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
  })

  return NextResponse.json(
    conversations.map((c) => ({
      id: c.id,
      clientPhone: c.clientPhone,
      clientName: c.clientName,
      assignedTrainer: c.assignedTrainer,
      lastMessageAt: c.lastMessageAt,
      lastInboundAt: c.lastInboundAt,
      unread: ctx.role === "ADMIN" ? c.unreadAdmin : c.unreadTrainer,
      lastMessage: c.messages[0]
        ? {
            id: c.messages[0].id,
            direction: c.messages[0].direction,
            type: c.messages[0].type,
            body: c.messages[0].body,
            createdAt: c.messages[0].createdAt,
          }
        : null,
    })),
  )
}
