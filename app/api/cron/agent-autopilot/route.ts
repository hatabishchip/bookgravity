import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { assertCronAuth } from "@/lib/cron-auth"
import { sendWhatsAppText, sendWhatsAppTemplate, getConfigFor } from "@/lib/whatsapp-cloud"
import {
  appendOutboundMessage,
  isInsideCustomerWindow,
  markConversationHandled,
} from "@/lib/whatsapp-conversation"
import { generateAgentSuggestion, extractLessons } from "@/lib/sales-agent"
import { translateAndDetect } from "@/lib/translate"
import { elog, elogError } from "@/lib/elog"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Sales-agent AUTOPILOT sweep (owner 15.07.2026, meta docs/META_agent_autopilot.md).
//
// Every 30 minutes (external pinger; Vercel Hobby crons are daily-only):
//  1. Canggu conversations where the CLIENT has the last word get a suggestion
//     (if the webhook missed it) and pending SAFE drafts are AUTO-SENT by the
//     agent - open window as free-form text, closed window via the approved
//     admin_message template. BOOKING / ESCALATE never auto-send: they stay as
//     the yellow "needs your reply" flag for the trainer.
//  2. RU journal backfill: questionRu / answerRu translations for
//     /admin/agent-log (best-effort, capped per sweep).
//  3. Self-learning: mine edited_sent / dismissed suggestions into lessons.
//
// Guards: one auto-reply per inbound (suggestion row is the lock), never when
// staff already replied (last word check), never re-ping a silent client (the
// last word must be the client's), never mid cancel-bot flow, only text
// inbounds, hard cap per sweep.

const SWEEP_WINDOW_MS = 72 * 60 * 60 * 1000 // only look at recent inbounds; history is phase E
const MAX_AUTO_SENDS = 30
const MAX_TRANSLATIONS = 15 // per kind (questions / answers) per sweep
const TIME_BUDGET_MS = 45_000 // stop starting new work after this

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req)
  if (denied) return denied
  const startedAt = Date.now()
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt)

  const studio = await prisma.studio.findFirst({
    where: { slug: "canggu" },
    select: {
      id: true,
      whatsappEnabled: true,
      whatsappPhoneNumberId: true,
      whatsappAccessToken: true,
    },
  })
  if (!studio?.whatsappEnabled) {
    return NextResponse.json({ ok: false, reason: "canggu WhatsApp disabled" })
  }
  const waConfig = getConfigFor(studio)

  let checked = 0
  let autoSent = 0
  let failed = 0

  // ---- 1. Auto-send SAFE drafts -------------------------------------------
  const convos = await prisma.whatsAppConversation.findMany({
    where: {
      studioId: studio.id,
      lastInboundAt: { gte: new Date(Date.now() - SWEEP_WINDOW_MS) },
    },
    orderBy: { lastInboundAt: "desc" },
    take: 100,
    select: {
      id: true,
      clientPhone: true,
      clientName: true,
      lastInboundAt: true,
      pendingCancelBookingId: true,
    },
  })

  for (const convo of convos) {
    if (autoSent >= MAX_AUTO_SENDS || timeLeft() <= 0) break
    checked++
    // The cancel bot owns this chat mid-flow - don't talk over it.
    if (convo.pendingCancelBookingId) continue

    // The client must have the last word; any staff/agent reply disarms us.
    const lastMsg = await prisma.whatsAppMessage.findFirst({
      where: { conversationId: convo.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, direction: true, type: true, body: true },
    })
    if (!lastMsg || lastMsg.direction !== "INBOUND") continue
    // Only auto-answer text (a voice note / image answered generically reads wrong).
    if (!lastMsg.body?.trim()) continue

    // Existing pending suggestion for this inbound, or generate one now
    // (also covers inbounds the webhook's after() missed).
    const sug = await generateAgentSuggestion(convo.id, lastMsg.id)
    if (!sug || sug.category !== "SAFE" || !sug.draft?.trim()) continue

    const draft = sug.draft.trim()
    const windowOpen = isInsideCustomerWindow(convo.lastInboundAt)
    let ok = false
    let waMessageId: string | null = null
    let errorDetail: string | null = null
    let sentType = "text"
    let templateName: string | null = null

    if (windowOpen) {
      const res = await sendWhatsAppText(convo.clientPhone, draft, waConfig)
      ok = res.ok
      waMessageId = res.ok ? res.messageId : null
      errorDetail = res.ok ? null : res.error
    } else {
      // Same closed-window path staff uses: approved admin_message template,
      // {{1}} = first name, {{2}} = the text (sanitized inside).
      templateName = process.env.WHATSAPP_TEMPLATE_ADMIN_MESSAGE || "admin_message"
      sentType = "template"
      const firstName = (convo.clientName ?? "").trim().split(/\s+/)[0] || "there"
      const res = await sendWhatsAppTemplate({
        toPhone: convo.clientPhone,
        templateName,
        languageCode: process.env.WHATSAPP_TEMPLATE_LANG || "en",
        variables: [firstName, draft],
        config: waConfig,
      })
      ok = res.ok
      waMessageId = res.ok ? res.messageId : null
      errorDetail = res.ok ? null : res.error
    }

    await appendOutboundMessage({
      conversationId: convo.id,
      type: sentType,
      body: draft,
      templateName,
      waMessageId,
      status: ok ? "sent" : "failed",
      errorDetail,
      fromAgent: true,
    })

    if (ok) {
      autoSent++
      await prisma.agentSuggestion.update({
        where: { id: sug.id },
        data: { status: "auto_sent", sentText: draft },
      })
      // Any other stale pending cards on this chat are now moot.
      await prisma.agentSuggestion.updateMany({
        where: { conversationId: convo.id, status: "pending", id: { not: sug.id } },
        data: { status: "expired" },
      })
      await markConversationHandled(convo.id)
    } else {
      failed++
      void elogError("agent:autopilot", "auto-send failed", {
        conversationId: convo.id,
        error: errorDetail,
      })
    }
  }

  // ---- 2. RU journal backfill ---------------------------------------------
  let translatedQ = 0
  let translatedA = 0
  if (timeLeft() > 5_000) {
    const needQuestion = await prisma.agentSuggestion.findMany({
      where: { questionRu: null, inboundMessageId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: MAX_TRANSLATIONS,
      select: { id: true, inboundMessageId: true },
    })
    for (const s of needQuestion) {
      if (timeLeft() <= 3_000) break
      const inbound = await prisma.whatsAppMessage.findUnique({
        where: { id: s.inboundMessageId! },
        select: { body: true },
      })
      const text = inbound?.body?.trim()
      if (!text) {
        // Nothing to translate (media inbound) - stamp so we don't retry forever.
        await prisma.agentSuggestion.update({ where: { id: s.id }, data: { questionRu: "[медиа]" } })
        continue
      }
      const t = await translateAndDetect({ text, targetLang: "ru" })
      if (t.ok && t.translated.trim()) {
        await prisma.agentSuggestion.update({ where: { id: s.id }, data: { questionRu: t.translated.trim() } })
        translatedQ++
      }
    }

    const needAnswer = await prisma.agentSuggestion.findMany({
      where: { answerRu: null, sentText: { not: null } },
      orderBy: { createdAt: "desc" },
      take: MAX_TRANSLATIONS,
      select: { id: true, sentText: true },
    })
    for (const s of needAnswer) {
      if (timeLeft() <= 3_000) break
      const t = await translateAndDetect({ text: s.sentText!, targetLang: "ru" })
      if (t.ok && t.translated.trim()) {
        await prisma.agentSuggestion.update({ where: { id: s.id }, data: { answerRu: t.translated.trim() } })
        translatedA++
      }
    }
  }

  // ---- 3. Self-learning ----------------------------------------------------
  let lessons = 0
  if (timeLeft() > 8_000) {
    lessons = await extractLessons(5)
  }

  const summary = { ok: true, checked, autoSent, failed, translatedQ, translatedA, lessons }
  if (autoSent || failed || lessons) void elog("agent:autopilot", "sweep", summary)
  return NextResponse.json(summary)
}
