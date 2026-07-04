import { NextRequest, NextResponse } from "next/server"
import { requireAuth, isAdminRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { sendWhatsAppText, sendWhatsAppTemplate, getConfigFor } from "@/lib/whatsapp-cloud"
import {
  appendOutboundMessage,
  isInsideCustomerWindow,
  trainerHasAccess,
  markConversationHandled,
} from "@/lib/whatsapp-conversation"
import { translateAndDetect } from "@/lib/translate"
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
  // Optional human-readable text to store as the chat-bubble body (so the
  // thread shows the real message instead of "[template_name] var").
  display: z.string().max(2000).optional(),
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

  // This studio's own WhatsApp number/token (falls back to global env). All
  // outbound sends for this conversation go through the studio's own WABA so
  // each studio uses its own Facebook number + branding.
  const studioWA = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { whatsappPhoneNumberId: true, whatsappAccessToken: true },
  })
  const waConfig = getConfigFor(studioWA)

  let fromTrainerId: string | null = null
  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || !(await trainerHasAccess(convo.id, trainer.id))) {
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
      config: waConfig,
    })
    const saved = await appendOutboundMessage({
      conversationId: convo.id,
      type: "template",
      body: parsed.data.display
        ? parsed.data.display
        : parsed.data.variables?.length
          ? `[${parsed.data.templateName}] ${parsed.data.variables.join(" | ")}`
          : `[${parsed.data.templateName}]`,
      templateName: parsed.data.templateName,
      waMessageId: res.ok ? res.messageId : null,
      status: res.ok ? "sent" : "failed",
      errorDetail: res.ok ? null : res.error,
      fromTrainerId,
    })

    // Same-day reminder sent manually (trainer/admin picked the
    // class_today_confirm template): arm the conversation so the client's NEXT
    // reply is forwarded to the trainer assigned to them — identical behaviour
    // to the automatic 2.5h cron. The webhook forwards the first reply, then
    // disarms (only one message reaches the trainer). Re-arms on every send of
    // this template.
    const todayConfirmName =
      process.env.WHATSAPP_TEMPLATE_TODAY_CONFIRM || "class_today_confirm"
    if (res.ok && parsed.data.templateName === todayConfirmName) {
      try {
        // The trainer assigned to this client; fall back to the sending trainer.
        const trainerId = convo.assignedTrainerId ?? fromTrainerId
        if (trainerId) {
          const t = await prisma.trainer.findUnique({
            where: { id: trainerId },
            select: { whatsapp: true, notifyWhatsapp: true },
          })
          const phone = t?.whatsapp?.trim()
          await prisma.whatsAppConversation.update({
            where: { id: convo.id },
            data: {
              pendingReminderTrainerPhone: t?.notifyWhatsapp && phone ? phone : null,
            },
          })
        }
      } catch (err) {
        console.error("[messages/POST] arm reminder-forward failed:", err)
      }
    }

    // Staff replied → the chat is handled: clear unread for admin + trainer.
    if (res.ok) await markConversationHandled(convo.id)

    return NextResponse.json(
      { message: saved, sendResult: res },
      { status: res.ok ? 201 : 502 },
    )
  }

  // ---------- Text path ----------
  // Staff (admin AND trainer of this studio) can message a client at ANY time.
  // When the 24h customer-service window is closed we auto-fall back to the
  // approved "admin_message" template (see scripts/create-admin-message-template.ts),
  // wrapping the typed text as variable {{2}}.
  //
  // Trainers used to hit a 409 when the window was closed - but that blocked the
  // exact case that matters (owner 2026-07-04, Coach Dita sick): a trainer needs
  // to tell TODAY's students the class is cancelled/moved, and those students
  // are usually outside the window (they got a reminder but didn't reply). Since
  // this goes via an approved template (never free-form), letting trainers use
  // it is safe. Trainers are already access-gated to their own conversations
  // above (trainerHasAccess). STAFF (cleaning) is still not a messaging role.
  const staffCanMessage = isAdminRole(ctx.role) || ctx.role === "TRAINER"
  const parsed = TextSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const windowOpen = isInsideCustomerWindow(convo.lastInboundAt)
  if (!windowOpen && !staffCanMessage) {
    return NextResponse.json(
      {
        error:
          "24h customer-service window is closed. Wait for the client to message first, or ask the admin to reach out.",
        code: "window_closed",
      },
      { status: 409 },
    )
  }

  // Studio config: inbox language for auto-translation.
  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { inboxLanguage: true },
  })
  const adminLang = studio?.inboxLanguage ?? null
  const clientLang = convo.clientLanguage ?? null

  const originalText = parsed.data.text
  let textToSend = originalText
  let translatedBody: string | null = null
  let detectedLang: string | null = adminLang
  let translatedVia: string | null = null

  // Auto-translate admin text into the client's detected language so the
  // client receives the message in whatever language they wrote in. The
  // bubble UI shows the admin's typed original under the translated text.
  if (adminLang && clientLang && adminLang !== clientLang) {
    const t = await translateAndDetect({ text: originalText, targetLang: clientLang })
    if (t.ok && t.sourceLang !== clientLang && t.translated.trim().length > 0) {
      textToSend = t.translated
      translatedBody = t.translated
      detectedLang = t.sourceLang || adminLang
      translatedVia = t.provider
    } else if (!t.ok) {
      console.warn("[messages/POST] outbound translate failed:", t.error)
    }
  }

  // Closed-window template fallback for staff (admin + trainer). Wraps the
  // typed (already translated, if applicable) text as the {{2}} variable of
  // `admin_message`, with the client's name as {{1}} (fallback: "there").
  if (!windowOpen && staffCanMessage) {
    const adminTemplate =
      process.env.WHATSAPP_TEMPLATE_ADMIN_MESSAGE || "admin_message"
    const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
    const clientFirstName = (convo.clientName ?? "").trim().split(/\s+/)[0] || "there"
    const res = await sendWhatsAppTemplate({
      toPhone: convo.clientPhone,
      templateName: adminTemplate,
      languageCode: lang,
      variables: [clientFirstName, textToSend],
      config: waConfig,
    })
    const saved = await appendOutboundMessage({
      conversationId: convo.id,
      type: "template",
      body: originalText,
      translatedBody,
      translatedVia,
      detectedLang,
      templateName: adminTemplate,
      waMessageId: res.ok ? res.messageId : null,
      status: res.ok ? "sent" : "failed",
      errorDetail: res.ok ? null : res.error,
      fromTrainerId,
    })
    if (res.ok) await markConversationHandled(convo.id)
    return NextResponse.json(
      { message: saved, sendResult: res },
      { status: res.ok ? 201 : 502 },
    )
  }

  const res = await sendWhatsAppText(convo.clientPhone, textToSend, waConfig)
  const saved = await appendOutboundMessage({
    conversationId: convo.id,
    type: "text",
    body: originalText,
    translatedBody,
    translatedVia,
    detectedLang,
    waMessageId: res.ok ? res.messageId : null,
    status: res.ok ? "sent" : "failed",
    errorDetail: res.ok ? null : res.error,
    fromTrainerId,
  })
  if (res.ok) await markConversationHandled(convo.id)
  return NextResponse.json(
    { message: saved, sendResult: res },
    { status: res.ok ? 201 : 502 },
  )
}
