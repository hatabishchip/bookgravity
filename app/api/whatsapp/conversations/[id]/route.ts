import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { markConversationRead } from "@/lib/whatsapp-conversation"

async function loadConvoForUser(convoId: string) {
  const ctx = await requireAuth()
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const convo = await prisma.whatsAppConversation.findFirst({
    where: { id: convoId, studioId: ctx.studioId },
    include: { assignedTrainer: { select: { id: true, name: true, color: true } } },
  })
  if (!convo) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  // Trainer can only access conversations assigned to them.
  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || convo.assignedTrainerId !== trainer.id) {
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

  return NextResponse.json({
    id: convo.id,
    clientPhone: convo.clientPhone,
    clientName: convo.clientName,
    assignedTrainer: convo.assignedTrainer,
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
    include: { assignedTrainer: { select: { id: true, name: true, color: true } } },
  })
  return NextResponse.json({ assignedTrainer: updated.assignedTrainer })
}
