import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { trainerHasAccess, isInsideCustomerWindow } from "@/lib/whatsapp-conversation"
import { sendWhatsAppReaction, getConfigFor } from "@/lib/whatsapp-cloud"
import { z } from "zod"

// Reactions the team can put on a message (WhatsApp-style). Empty string clears.
const ALLOWED = ["❤️", "👍", "🔥", "🥰", "😌", "🤩", "😇", "🥳", "🤠", "🌞", "🤌", ""]
const Schema = z.object({ emoji: z.string() })

// POST /api/whatsapp/messages/[id]/react  body: { emoji }
//
// Persists the reaction on the message and mirrors it to the client via the
// Cloud API when the 24h window is open (and we have the message's wamid).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const parsed = Schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 })
  const emoji = parsed.data.emoji
  if (!ALLOWED.includes(emoji)) {
    return NextResponse.json({ error: "unsupported_emoji" }, { status: 400 })
  }

  const message = await prisma.whatsAppMessage.findUnique({
    where: { id },
    include: { conversation: { select: { id: true, studioId: true, clientPhone: true, lastInboundAt: true } } },
  })
  if (!message || message.conversation.studioId !== ctx.studioId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || !(await trainerHasAccess(message.conversation.id, trainer.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // Persist first so the team's reaction sticks even if Meta delivery fails.
  await prisma.whatsAppMessage.update({
    where: { id: message.id },
    data: { reaction: emoji || null },
  })

  // Mirror to the client when possible. Reactions, like free-form text, only
  // work inside the 24h window and need the original message's wamid.
  let delivered = false
  let deliverError: string | null = null
  if (message.waMessageId && isInsideCustomerWindow(message.conversation.lastInboundAt)) {
    const studioWA = await prisma.studio.findUnique({
      where: { id: ctx.studioId },
      select: { whatsappPhoneNumberId: true, whatsappAccessToken: true },
    })
    const r = await sendWhatsAppReaction(
      message.conversation.clientPhone,
      message.waMessageId,
      emoji,
      getConfigFor(studioWA),
    )
    delivered = r.ok
    if (!r.ok) deliverError = r.error
  } else {
    deliverError = "window_closed_or_no_wamid"
  }

  return NextResponse.json({ reaction: emoji || null, delivered, deliverError })
}
