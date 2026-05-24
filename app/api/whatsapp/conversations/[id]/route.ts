import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { markConversationRead, trainerHasAccess } from "@/lib/whatsapp-conversation"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { markMessageRead } from "@/lib/whatsapp-cloud"

async function loadConvoForUser(convoId: string) {
  const ctx = await requireAuth()
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!(await isStudioWhatsAppEnabled(ctx.studioId))) {
    return {
      error: NextResponse.json(
        { error: "WhatsApp not enabled for this studio" },
        { status: 403 },
      ),
    }
  }
  const convo = await prisma.whatsAppConversation.findFirst({
    where: { id: convoId, studioId: ctx.studioId },
    include: {
      assignedTrainer: { select: { id: true, name: true, color: true } },
      access: {
        include: { trainer: { select: { id: true, name: true, color: true } } },
      },
    },
  })
  if (!convo) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  // Trainer can access a chat if they're in the access list (multi-assign).
  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || !(await trainerHasAccess(convo.id, trainer.id))) {
      return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
    }
  }
  return { ctx, convo }
}

// GET /api/whatsapp/conversations/[id]  — full message thread + meta.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const r = await loadConvoForUser(id)
  if ("error" in r) return r.error
  const { ctx, convo } = r

  const messages = await prisma.whatsAppMessage.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: { fromTrainer: { select: { id: true, name: true } } },
  })

  // Mark read for the viewer.
  await markConversationRead(convo.id, ctx.role === "ADMIN" ? "admin" : "trainer")

  // Send Meta "read" receipts for any inbound messages we haven't ack'd yet
  // so the client sees blue double-checks on their side. Done in the
  // background — never blocks the API response.
  const unread = messages.filter(
    (m) => m.direction === "INBOUND" && m.waMessageId && m.status !== "read",
  )
  if (unread.length > 0) {
    void Promise.all(
      unread.map(async (m) => {
        const r = await markMessageRead(m.waMessageId!)
        if (r.ok) {
          await prisma.whatsAppMessage
            .update({ where: { id: m.id }, data: { status: "read" } })
            .catch(() => {})
        } else {
          console.warn("[conversations] markMessageRead failed:", m.waMessageId, r.error)
        }
      }),
    )
  }

  return NextResponse.json({
    id: convo.id,
    clientPhone: convo.clientPhone,
    clientName: convo.clientName,
    assignedTrainer: convo.assignedTrainer,
    accessTrainers: convo.access.map((a) => a.trainer),
    lastInboundAt: convo.lastInboundAt,
    lastMessageAt: convo.lastMessageAt,
    messages,
  })
}

// PATCH /api/whatsapp/conversations/[id]  — admin reassigns trainer.
// body: { assignedTrainerId: string | null }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const r = await loadConvoForUser(id)
  if ("error" in r) return r.error
  const { ctx, convo } = r
  if (ctx.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { assignedTrainerId } = (await req.json()) as { assignedTrainerId: string | null }
  if (assignedTrainerId) {
    const trainer = await prisma.trainer.findFirst({
      where: { id: assignedTrainerId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer) return NextResponse.json({ error: "Trainer not in this studio" }, { status: 400 })
  }
  const updated = await prisma.whatsAppConversation.update({
    where: { id: convo.id },
    data: { assignedTrainerId: assignedTrainerId ?? null },
    include: {
      assignedTrainer: { select: { id: true, name: true, color: true } },
      access: {
        include: { trainer: { select: { id: true, name: true, color: true } } },
      },
    },
  })
  // Also grant the new trainer access (additive — doesn't revoke anyone).
  if (assignedTrainerId) {
    await prisma.whatsAppConversationAccess
      .upsert({
        where: {
          conversationId_trainerId: { conversationId: convo.id, trainerId: assignedTrainerId },
        },
        update: {},
        create: { conversationId: convo.id, trainerId: assignedTrainerId },
      })
      .catch(() => {})
  }
  return NextResponse.json({
    assignedTrainer: updated.assignedTrainer,
    accessTrainers: updated.access.map((a) => a.trainer),
  })
}
