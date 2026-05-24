import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { sendWhatsAppText, sendWhatsAppTemplate } from "@/lib/whatsapp-cloud"
import {
  appendOutboundMessage,
  isInsideCustomerWindow,
} from "@/lib/whatsapp-conversation"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"

// POST /api/whatsapp/conversations/[id]/messages
// body: { text: string }  OR  { templateName: string, languageCode?: string, variables?: string[] }
//
// Sends via Cloud API and persists the outbound message. Returns the saved row.
//
// Permission: admin can post to any conversation in their studio. Trainer can
// post only to conversations assigned to them.

const TextSchema = z.object({ text: z.string().min(1).max(4096) })
const TemplateSchema = z.object({
  templateName: z.string().min(1).max(64),
  languageCode: z.string().min(2).max(10).optional(),
  variables: z.array(z.string()).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isStudioWhatsAppEnabled(ctx.studioId))) {
    return NextResponse.json({ error: "WhatsApp not enabled for this studio" }, { status: 403 })
  }

  const { id } = await params
  const convo = await prisma.whatsAppConversation.findFirst({
    where: { id, studioId: ctx.studioId },
  })
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let fromTrainerId: string | null = null
  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || convo.assignedTrainerId !== trainer.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    fromTrainerId = trainer.id
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  // ---------- Template path: always allowed (no 24h restriction) ----------
  if (typeof body.templateName === "string") {
    const parsed = TemplateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const lang = parsed.data.languageCode || process.env.WHATSAPP_TEMPLATE_LANG || "en"
    const res = await sendWhatsAppTemplate({
      toPhone: convo.clientPhone,
      templateName: parsed.data.templateName,
      languageCode: lang,
      variables: parsed.data.variables ?? [],
    })
    const saved = await appendOutboundMessage({
      conversationId: convo.id,
      type: "template",
      body: parsed.data.variables?.length
        ? `[${parsed.data.templateName}] ${parsed.data.variables.join(" | ")}`
        : `[${parsed.data.templateName}]`,
      templateName: parsed.data.templateName,
      waMessageId: res.ok ? res.messageId : null,
      status: res.ok ? "sent" : "failed",
      errorDetail: res.ok ? null : res.error,
      fromTrainerId,
    })
    return NextResponse.json(
      { message: saved, sendResult: res },
      { status: res.ok ? 201 : 502 },
    )
  }

  // ---------- Text path: only inside the 24h customer-service window ----------
  const parsed = TextSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  if (!isInsideCustomerWindow(convo.lastInboundAt)) {
    return NextResponse.json(
      {
        error:
          "24h customer-service window is closed. Send an approved template instead, or wait for the client to message you first.",
        code: "window_closed",
      },
      { status: 409 },
    )
  }

  const res = await sendWhatsAppText(convo.clientPhone, parsed.data.text)
  const saved = await appendOutboundMessage({
    conversationId: convo.id,
    type: "text",
    body: parsed.data.text,
    waMessageId: res.ok ? res.messageId : null,
    status: res.ok ? "sent" : "failed",
    errorDetail: res.ok ? null : res.error,
    fromTrainerId,
  })
  return NextResponse.json(
    { message: saved, sendResult: res },
    { status: res.ok ? 201 : 502 },
  )
}
