// Server-side helpers for WhatsApp inbox. Centralized so webhook, booking
// hook and send endpoint share the same upsert/append logic and counter rules.
import { prisma } from "@/lib/prisma"

/** Normalize a phone number to bare digits — same shape Meta returns in webhooks. */
export function normalizePhone(phone: string): string {
  return (phone || "").replace(/\D/g, "")
}

/** 24h customer-service window: free-form text is allowed only if lastInboundAt is within 24h. */
export function isInsideCustomerWindow(lastInboundAt: Date | null | undefined): boolean {
  if (!lastInboundAt) return false
  const diffMs = Date.now() - new Date(lastInboundAt).getTime()
  return diffMs < 24 * 60 * 60 * 1000
}

/** ms remaining until the customer-service window closes; 0 if already closed. */
export function customerWindowRemainingMs(lastInboundAt: Date | null | undefined): number {
  if (!lastInboundAt) return 0
  const diff = 24 * 60 * 60 * 1000 - (Date.now() - new Date(lastInboundAt).getTime())
  return diff > 0 ? diff : 0
}

/**
 * Find or create a Conversation for (studio, clientPhone). Optionally updates
 * clientName / assignedTrainerId when fresher info is available (e.g. booking).
 *
 * When `assignedTrainerId` is provided we ALSO add a row to the access table
 * for that trainer (idempotent — no-op if the trainer already had access).
 * This is what makes multi-trainer access work: every booking grants the
 * slot's trainer the right to see the chat, without revoking access from any
 * trainer who previously had it.
 */
export async function upsertConversation(opts: {
  studioId: string
  clientPhone: string
  clientName?: string | null
  assignedTrainerId?: string | null
  /** If true, overwrite assignedTrainerId even when conversation already had one. */
  forceReassign?: boolean
}) {
  const phone = normalizePhone(opts.clientPhone)
  if (!phone) throw new Error("upsertConversation: empty phone")

  const existing = await prisma.whatsAppConversation.findUnique({
    where: { studioId_clientPhone: { studioId: opts.studioId, clientPhone: phone } },
  })

  let convo
  if (!existing) {
    convo = await prisma.whatsAppConversation.create({
      data: {
        studioId: opts.studioId,
        clientPhone: phone,
        clientName: opts.clientName ?? null,
        assignedTrainerId: opts.assignedTrainerId ?? null,
        lastMessageAt: new Date(),
      },
    })
  } else {
    // Update name only if we have a non-empty new value (don't overwrite with null/empty).
    // Update assignedTrainerId when (a) reassign forced, or (b) was null + we have one now.
    const patch: {
      clientName?: string
      assignedTrainerId?: string | null
    } = {}
    if (opts.clientName && opts.clientName !== existing.clientName) {
      patch.clientName = opts.clientName
    }
    if (
      opts.assignedTrainerId &&
      (opts.forceReassign || !existing.assignedTrainerId) &&
      existing.assignedTrainerId !== opts.assignedTrainerId
    ) {
      patch.assignedTrainerId = opts.assignedTrainerId
    }
    convo =
      Object.keys(patch).length > 0
        ? await prisma.whatsAppConversation.update({
            where: { id: existing.id },
            data: patch,
          })
        : existing
  }

  // Grant the trainer access (idempotent). Using upsert with unique
  // (conversationId, trainerId) — second+ bookings with same trainer are no-ops.
  if (opts.assignedTrainerId) {
    try {
      await prisma.whatsAppConversationAccess.upsert({
        where: {
          conversationId_trainerId: {
            conversationId: convo.id,
            trainerId: opts.assignedTrainerId,
          },
        },
        update: {},
        create: {
          conversationId: convo.id,
          trainerId: opts.assignedTrainerId,
        },
      })
    } catch (err) {
      // Don't fail the whole upsert if the access grant has a transient hiccup —
      // the conversation still exists and the next booking will retry.
      console.error("[upsertConversation] access grant failed:", err)
    }
  }

  return convo
}

/** Check whether a trainer has access to a conversation. */
export async function trainerHasAccess(
  conversationId: string,
  trainerId: string,
): Promise<boolean> {
  const row = await prisma.whatsAppConversationAccess.findUnique({
    where: { conversationId_trainerId: { conversationId, trainerId } },
    select: { id: true },
  })
  return !!row
}

/** Append an INBOUND message + bump unread counters + update lastInboundAt/lastMessageAt. */
export async function appendInboundMessage(opts: {
  conversationId: string
  type: string
  body?: string | null
  mediaUrl?: string | null
  mediaMime?: string | null
  waMessageId?: string | null
  receivedAt: Date
}) {
  const msg = await prisma.whatsAppMessage.create({
    data: {
      conversationId: opts.conversationId,
      direction: "INBOUND",
      type: opts.type,
      body: opts.body ?? null,
      mediaUrl: opts.mediaUrl ?? null,
      mediaMime: opts.mediaMime ?? null,
      waMessageId: opts.waMessageId ?? null,
      status: "delivered", // inbound means it reached us
      createdAt: opts.receivedAt,
    },
  })
  await prisma.whatsAppConversation.update({
    where: { id: opts.conversationId },
    data: {
      lastMessageAt: opts.receivedAt,
      lastInboundAt: opts.receivedAt,
      unreadAdmin: { increment: 1 },
      unreadTrainer: { increment: 1 },
    },
  })
  return msg
}

/** Append an OUTBOUND message (we sent it). Does NOT increment unread counters. */
export async function appendOutboundMessage(opts: {
  conversationId: string
  type: string // "text" | "template" | "image" | ...
  body?: string | null
  templateName?: string | null
  waMessageId?: string | null
  status?: string // queued|sent|delivered|read|failed
  errorDetail?: string | null
  fromTrainerId?: string | null
}) {
  const msg = await prisma.whatsAppMessage.create({
    data: {
      conversationId: opts.conversationId,
      direction: "OUTBOUND",
      type: opts.type,
      body: opts.body ?? null,
      templateName: opts.templateName ?? null,
      waMessageId: opts.waMessageId ?? null,
      status: opts.status ?? "sent",
      errorDetail: opts.errorDetail ?? null,
      fromTrainerId: opts.fromTrainerId ?? null,
    },
  })
  await prisma.whatsAppConversation.update({
    where: { id: opts.conversationId },
    data: { lastMessageAt: new Date() },
  })
  return msg
}

/** Update a message's delivery status by Meta's wamid. No-op if message not found. */
export async function updateMessageStatus(opts: {
  waMessageId: string
  status: string
  errorDetail?: string | null
}) {
  await prisma.whatsAppMessage.updateMany({
    where: { waMessageId: opts.waMessageId },
    data: {
      status: opts.status,
      ...(opts.errorDetail ? { errorDetail: opts.errorDetail } : {}),
    },
  })
}

/** Reset unread counter for a given viewer. */
export async function markConversationRead(
  conversationId: string,
  viewer: "admin" | "trainer"
) {
  await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: viewer === "admin" ? { unreadAdmin: 0 } : { unreadTrainer: 0 },
  })
}
