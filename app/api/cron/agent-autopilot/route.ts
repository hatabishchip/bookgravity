import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { assertCronAuth } from "@/lib/cron-auth"
import { sendWhatsAppText, sendWhatsAppTemplate, getConfigFor } from "@/lib/whatsapp-cloud"
import {
  appendOutboundMessage,
  isInsideCustomerWindow,
  markConversationHandled,
} from "@/lib/whatsapp-conversation"
import { generateAgentSuggestion, extractLessons, isNewClient } from "@/lib/sales-agent"
import { forwardClientReplyToTrainer } from "@/lib/whatsapp-messages"
import { syncInstagramThreads, sendInstagramText, getIgToken, isIgConversationPhone } from "@/lib/instagram"
import { syncFacebookThreads, sendFacebookText, getFbPageToken, isFbConversationPhone } from "@/lib/facebook"
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

// 7 days (owner 19.07: unanswered chats older than the old 72h window fell off
// the radar forever - e.g. @beduinheart at 71h). Dedup by inboundMessageId and
// the once-ever trainer ping keep the wider window from spamming anyone.
const SWEEP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
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
  let trainerPinged = 0

  // One WhatsApp to the trainer per BOOKING/ESCALATE suggestion, ever.
  // Recipient: the conversation's assigned trainer, else every studio trainer
  // with notifyWhatsapp on. Quiet at Bali night (23:00-07:00, UTC+8).
  const notifyTrainer = async (
    convo: { id: string; clientName: string | null; clientPhone: string; assignedTrainerId: string | null },
    suggestionId: string,
    clientText: string | null,
  ) => {
    const baliHour = (new Date().getUTCHours() + 8) % 24
    if (baliHour >= 23 || baliHour < 7) return
    const sug = await prisma.agentSuggestion.findUnique({
      where: { id: suggestionId },
      select: { trainerNotifiedAt: true, reason: true },
    })
    if (!sug || sug.trainerNotifiedAt) return

    const trainers = convo.assignedTrainerId
      ? await prisma.trainer.findMany({
          where: { id: convo.assignedTrainerId, notifyWhatsapp: true },
          select: { whatsapp: true },
        })
      : await prisma.trainer.findMany({
          where: { studioId: studio.id, notifyWhatsapp: true },
          select: { whatsapp: true },
        })
    const phones = trainers.map((t) => t.whatsapp?.trim()).filter((p): p is string => !!p)
    if (!phones.length) return

    const summary = (sug.reason || clientText || "needs your reply").slice(0, 160)
    let anyOk = false
    for (const phone of phones) {
      const res = await forwardClientReplyToTrainer({
        trainerPhone: phone,
        clientName: convo.clientName ?? convo.clientPhone,
        type: "text",
        body: `is waiting in the inbox (agent flagged): ${summary}`,
        config: waConfig,
      })
      if (res.ok) anyOk = true
    }
    if (anyOk) {
      trainerPinged++
      await prisma.agentSuggestion.update({
        where: { id: suggestionId },
        data: { trainerNotifiedAt: new Date() },
      })
    }
  }

  // ---- 0. Instagram DMs: mirror recent threads into the conversation tables
  // (owner 16.07) so the same agent loop below answers them too. Best-effort.
  let igImported = 0
  try {
    igImported = await syncInstagramThreads(studio.id)
  } catch (err) {
    console.warn("[autopilot] instagram sync failed:", err)
  }
  let fbImported = 0
  try {
    fbImported = await syncFacebookThreads(studio.id)
  } catch (err) {
    console.warn("[autopilot] facebook sync failed:", err)
  }

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
      assignedTrainerId: true,
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
    if (!sug) continue

    // BOOKING / ESCALATE: never auto-send - instead WhatsApp the trainer once
    // (owner 16.07: yellow cards were sitting unseen for hours). Uses the
    // approved client_reply_to_trainer template, so the trainer's own 24h
    // window doesn't matter. Skipped at Bali night (23:00-07:00) - the next
    // morning sweep delivers it.
    if (sug.category !== "SAFE") {
      await notifyTrainer(convo, sug.id, lastMsg.body).catch((err) =>
        console.warn("[autopilot] trainer notify failed:", err),
      )
      // BOOKING bridge (owner 17.07): NEW clients (no bookings under their
      // phone; all IG/FB leads) get one auto "book at bookgravity.com, a coach
      // will follow up" reply per conversation, so nobody waits in silence.
      // Returning clients stay coach-only. ESCALATE never auto-answers.
      const bridgeable =
        sug.category === "BOOKING" &&
        !!sug.draft?.trim() &&
        (await isNewClient(convo.clientPhone)) &&
        (await prisma.agentSuggestion.count({
          where: { conversationId: convo.id, category: "BOOKING", status: "auto_sent" },
        })) === 0
      if (!bridgeable) continue
    }
    if (!sug.draft?.trim()) continue

    const draft = sug.draft.trim()
    const windowOpen = isInsideCustomerWindow(convo.lastInboundAt)
    let ok = false
    let waMessageId: string | null = null
    let errorDetail: string | null = null
    let sentType = "text"
    let templateName: string | null = null

    // Instagram thread: reply via the IG Graph API. Only inside the 24h
    // messaging window (IG has no template fallback) - otherwise the pending
    // suggestion simply stays for the trainer.
    if (isIgConversationPhone(convo.clientPhone)) {
      if (!windowOpen) continue
      const igToken = await getIgToken()
      if (!igToken) continue
      const res = await sendInstagramText(convo.clientPhone.slice(3), draft, igToken)
      ok = res.ok
      waMessageId = res.ok ? res.messageId : null
      errorDetail = res.ok ? null : res.error
    } else if (isFbConversationPhone(convo.clientPhone)) {
      // Facebook Messenger: same 24h rule, no template fallback.
      if (!windowOpen) continue
      const fbToken = getFbPageToken()
      if (!fbToken) continue
      const res = await sendFacebookText(convo.clientPhone.slice(3), draft, fbToken)
      ok = res.ok
      waMessageId = res.ok ? res.messageId : null
      errorDetail = res.ok ? null : res.error
    } else if (windowOpen) {
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

  // ---- 2c. Transient-failure auto-retry (owner 20.07.2026) ------------------
  // ~1 in 5 failed sends is a Meta "unknown error" transient that succeeds on
  // a plain retry, but nobody was retrying - the client just never got the
  // message. Retry ONCE per failed free-form text (any studio): window still
  // open, failed within 2h, EventLog wa:retry row is the once-ever lock.
  let retriedOk = 0
  if (timeLeft() > 6_000) {
    const failedMsgs = await prisma.whatsAppMessage.findMany({
      where: {
        direction: "OUTBOUND",
        status: "failed",
        type: "text",
        templateName: null,
        createdAt: { gte: new Date(Date.now() - 2 * 3600_000) },
        errorDetail: { contains: "unknown" },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        conversation: {
          select: { id: true, clientPhone: true, lastInboundAt: true, studioId: true },
        },
      },
    })
    for (const m of failedMsgs) {
      if (timeLeft() <= 4_000) break
      const convo = m.conversation
      if (!convo || !m.body?.trim()) continue
      // WA free-form only: IG/FB have their own paths; window must be open.
      if (isIgConversationPhone(convo.clientPhone) || isFbConversationPhone(convo.clientPhone)) continue
      if (!isInsideCustomerWindow(convo.lastInboundAt)) continue
      const already = await prisma.eventLog.findFirst({
        where: { scope: "wa:retry", message: m.id },
        select: { id: true },
      })
      if (already) continue
      // Claim BEFORE sending - a second failure must not loop forever.
      await prisma.eventLog.create({ data: { scope: "wa:retry", message: m.id } })
      const cfgStudio = await prisma.studio.findUnique({
        where: { id: convo.studioId },
        select: { whatsappPhoneNumberId: true, whatsappAccessToken: true },
      })
      const cfg = getConfigFor(cfgStudio)
      if (!cfg) continue
      const res = await sendWhatsAppText(convo.clientPhone, m.body, cfg)
      if (res.ok) {
        await appendOutboundMessage({
          conversationId: convo.id,
          type: "text",
          body: m.body,
          waMessageId: res.messageId,
          status: "sent",
          fromAgent: m.fromAgent ?? false,
          fromTrainerId: m.fromTrainerId ?? null,
        })
        retriedOk++
      }
    }
  }

  // ---- 3. Self-learning ----------------------------------------------------
  let lessons = 0
  if (timeLeft() > 8_000) {
    lessons = await extractLessons(5)
  }

  const summary = { ok: true, checked, autoSent, failed, trainerPinged, igImported, fbImported, translatedQ, translatedA, retriedOk, lessons }
  if (autoSent || failed || lessons || trainerPinged || igImported) void elog("agent:autopilot", "sweep", summary)
  return NextResponse.json(summary)
}
