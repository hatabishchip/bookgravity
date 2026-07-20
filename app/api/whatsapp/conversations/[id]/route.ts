import { NextRequest, NextResponse } from "next/server"
import { requireAuth, isAdminRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { trainerHasAccess } from "@/lib/whatsapp-conversation"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { markMessageRead, getConfigFor } from "@/lib/whatsapp-cloud"

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

  // Owner rule (2026-07-06, supersedes 03.07 for the ADMIN counter) - the two
  // counters now mean different things:
  //   unreadAdmin   = "a client message NOBODY has even seen" → opening the
  //                   chat by ANY staff member (admin or trainer) clears it.
  //   unreadTrainer = "a client message nobody ANSWERED" → viewing never
  //                   clears it; only a staff reply or reaction does
  //                   (markConversationHandled).
  // The admin's "who is still waiting for an answer" control moved to the
  // Awaiting-reply filter tab, so the red number can calm down on view.
  await prisma.whatsAppConversation
    .update({ where: { id: convo.id }, data: { unreadAdmin: 0, bookingPreview: null } })
    .catch(() => {})

  // Send Meta "read" receipts for any inbound messages we haven't ack'd yet
  // so the client sees blue double-checks on their side. Done in the
  // background — never blocks the API response.
  const unread = messages.filter(
    (m) => m.direction === "INBOUND" && m.waMessageId && m.status !== "read",
  )
  if (unread.length > 0) {
    const studioWA = await prisma.studio.findUnique({
      where: { id: ctx.studioId },
      select: { whatsappPhoneNumberId: true, whatsappAccessToken: true },
    })
    const waConfig = getConfigFor(studioWA)
    void Promise.all(
      unread.map(async (m) => {
        const r = await markMessageRead(m.waMessageId!, waConfig)
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

  // Dead-number twin detection (Xu Yao incident 20.07.2026): a chat where the
  // client has NEVER written and at least one outbound came back undeliverable
  // is almost always a typo'd phone from a self-service booking. Look for the
  // client's REAL chat: same studio, client has written, and the number differs
  // by 1-2 digits (insert/delete/replace) or the name matches. Surfaced as a
  // banner so staff stop resending into a void.
  let possibleTwin: { id: string; clientName: string | null; clientPhone: string } | null = null
  if (!convo.lastInboundAt && !convo.clientPhone.startsWith("ig:") && !convo.clientPhone.startsWith("fb:")) {
    const undeliverable = messages.some(
      (m) => m.direction === "OUTBOUND" && m.status === "failed" && /undeliverab/i.test(m.errorDetail ?? ""),
    )
    if (undeliverable) {
      const editDistance = (a: string, b: string): number => {
        if (Math.abs(a.length - b.length) > 2) return 3
        const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
        for (let j = 0; j <= b.length; j++) dp[0][j] = j
        for (let i = 1; i <= a.length; i++)
          for (let j = 1; j <= b.length; j++)
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
        return dp[a.length][b.length]
      }
      const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim()
      const candidates = await prisma.whatsAppConversation.findMany({
        where: { studioId: ctx.studioId, id: { not: convo.id }, lastInboundAt: { not: null } },
        orderBy: { lastMessageAt: "desc" },
        take: 300,
        select: { id: true, clientName: true, clientPhone: true },
      })
      possibleTwin =
        candidates.find(
          (c) =>
            editDistance(c.clientPhone.replace(/\D/g, ""), convo.clientPhone.replace(/\D/g, "")) <= 2 ||
            (norm(c.clientName).length > 2 && norm(c.clientName) === norm(convo.clientName)),
        ) ?? null
    }
  }

  // Pending AI agent suggestion for this chat (suggest-mode) - shown as a
  // card above the composer. Rides along with every detail refresh so the
  // inbox needs no extra polling endpoint.
  const suggestion = await prisma.agentSuggestion
    .findFirst({
      where: { conversationId: convo.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      select: { id: true, category: true, draft: true, reason: true, createdAt: true },
    })
    .catch(() => null)

  return NextResponse.json({
    id: convo.id,
    clientPhone: convo.clientPhone,
    clientName: convo.clientName,
    assignedTrainer: convo.assignedTrainer,
    accessTrainers: convo.access.map((a) => a.trainer),
    lastInboundAt: convo.lastInboundAt,
    lastMessageAt: convo.lastMessageAt,
    messages,
    suggestion,
    possibleTwin,
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
  if (!isAdminRole(ctx.role)) return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { assignedTrainerId } = (await req.json()) as { assignedTrainerId: string | null }
  if (assignedTrainerId) {
    const trainer = await prisma.trainer.findFirst({
      where: { id: assignedTrainerId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer) return NextResponse.json({ error: "Trainer not in this studio" }, { status: 400 })
  }
  // Exclusive transfer: the chat moves to the new trainer. The previous
  // trainer(s) lose access (it disappears from their inbox); the new trainer
  // gains it. Admin always sees every chat regardless of these rows. Passing
  // null unassigns entirely (admin-only). Message history + the per-message
  // "who answered" tags are untouched, so the audit trail survives a transfer.
  await prisma.$transaction(async (tx) => {
    await tx.whatsAppConversation.update({
      where: { id: convo.id },
      data: { assignedTrainerId: assignedTrainerId ?? null },
    })
    await tx.whatsAppConversationAccess.deleteMany({ where: { conversationId: convo.id } })
    if (assignedTrainerId) {
      await tx.whatsAppConversationAccess.create({
        data: { conversationId: convo.id, trainerId: assignedTrainerId },
      })
    }
  })

  const updated = await prisma.whatsAppConversation.findUnique({
    where: { id: convo.id },
    include: {
      assignedTrainer: { select: { id: true, name: true, color: true } },
      access: {
        include: { trainer: { select: { id: true, name: true, color: true } } },
      },
    },
  })
  return NextResponse.json({
    assignedTrainer: updated?.assignedTrainer ?? null,
    accessTrainers: (updated?.access ?? []).map((a) => a.trainer),
  })
}
