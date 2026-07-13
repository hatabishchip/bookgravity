import { NextRequest, NextResponse, after } from "next/server"
import { elogError } from "@/lib/elog"
import { createHmac, timingSafeEqual } from "crypto"
import { prisma } from "@/lib/prisma"
import {
  upsertConversation,
  appendInboundMessage,
  updateMessageStatus,
} from "@/lib/whatsapp-conversation"
import {
  fetchMetaMedia,
  forwardInboundToOwner,
  forwardClientReplyToTrainer,
  getConfigFor,
} from "@/lib/whatsapp-cloud"
import { sendInboundWhatsAppCopy } from "@/lib/mailer"
import { translateAndDetect } from "@/lib/translate"
import { handleCancelBotMessage } from "@/lib/cancel-bot"
import { pickNextLeadTrainer } from "@/lib/lead-rotation"
import { recordBankPayment } from "@/lib/bank-payment"
import { sendPush } from "@/lib/expo-push"
import { sendWebPush } from "@/lib/web-push"
import { notifyDeliveryFailure } from "@/lib/delivery-alert"

// WhatsApp Cloud API webhook.
//
// Meta calls this endpoint for two things:
//   1. GET with hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
//      One-time handshake when you set the URL in App Dashboard → Webhooks.
//      We must echo hub.challenge as plain text if verify_token matches.
//   2. POST with message events (incoming messages, delivery statuses).
//      Signed with HMAC-SHA256 using your App Secret in X-Hub-Signature-256.
//
// Inbound messages are persisted into WhatsAppConversation + WhatsAppMessage so
// they show up in /admin/inbox and /trainer/inbox. Strangers (no booking ever
// made on that number) end up with assignedTrainerId=null → admin-only view.
//
// Required env:
//   WHATSAPP_VERIFY_TOKEN   — arbitrary string, also entered in App Dashboard
//   WHATSAPP_APP_SECRET     — App Secret from Settings → Basic (for sig check)

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  if (!expected) {
    return NextResponse.json({ error: "verify_token_not_configured" }, { status: 500 })
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 })
}

function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false
  const provided = signatureHeader.slice("sha256=".length)
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex")
  const a = Buffer.from(provided, "hex")
  const b = Buffer.from(expected, "hex")
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

type WAStatusError = { code: number; title?: string; error_data?: { details?: string } }
type WAStatus = {
  id: string
  status: string
  recipient_id: string
  errors?: WAStatusError[]
}
type WAMessage = {
  from: string
  id: string
  type: string
  text?: { body: string }
  image?: { id: string; mime_type?: string; caption?: string }
  audio?: { id: string; mime_type?: string }
  video?: { id: string; mime_type?: string; caption?: string }
  document?: { id: string; mime_type?: string; filename?: string; caption?: string }
  sticker?: { id: string; mime_type?: string }
  reaction?: { message_id: string; emoji?: string }
  // Quick-reply button tap from a template (e.g. the booking confirmation's
  // "Cancel booking" button). Arrives as type "button".
  button?: { text?: string; payload?: string }
  // CTWA (Click-to-WhatsApp) ad attribution. Present on the FIRST message a
  // client sends after tapping a paid ad. source_id = the Meta ad id.
  referral?: {
    source_url?: string
    source_id?: string
    source_type?: string // "ad" | "post"
    headline?: string
    body?: string
    ctwa_clid?: string
  }
  timestamp: string
}
type WAContact = { wa_id: string; profile?: { name?: string } }

/** Resolve which studio owns the number a message arrived on. Each studio is
 *  AUTONOMOUS: it has its own WhatsApp number, and we file the chat under the
 *  studio whose `whatsappPhoneNumberId` matches Meta's `metadata.phone_number_id`.
 *  If no studio owns the number, we return null and the message is IGNORED —
 *  no default-studio dumping, no cross-studio leakage. */
async function resolveStudioByPhoneNumberId(phoneNumberId: string | null) {
  if (!phoneNumberId) return null
  return prisma.studio.findFirst({
    where: { whatsappPhoneNumberId: phoneNumberId },
    select: {
      id: true,
      name: true,
      isDefault: true,
      inboxLanguage: true,
      emailAdminWaCopy: true,
      // Bank's WhatsApp sender for QRIS payment notifications (null = detect by
      // message content only).
      bankWhatsappSender: true,
      whatsappPhoneNumberId: true,
      whatsappAccessToken: true,
      whatsappEnabled: true,
      // Round-robin auto-assignment of ad leads to trainers.
      autoAssignLeads: true,
      // This studio's own admin — inbound WhatsApp email copies go ONLY here,
      // so a studio's messages never reach another studio's admin.
      users: {
        where: { role: "ADMIN" },
        select: { email: true },
        orderBy: { id: "asc" },
        take: 1,
      },
    },
  })
}

/** Pull message body + media-id + type into our normalized shape. */
function describeIncomingMessage(msg: WAMessage): {
  type: string
  body: string | null
  mediaUrl: string | null
  mediaMime: string | null
} {
  switch (msg.type) {
    case "text":
      return { type: "text", body: msg.text?.body ?? null, mediaUrl: null, mediaMime: null }
    case "image":
      return {
        type: "image",
        body: msg.image?.caption ?? null,
        mediaUrl: msg.image?.id ?? null, // store Meta media_id for later download
        mediaMime: msg.image?.mime_type ?? null,
      }
    case "audio":
      return {
        type: "audio",
        body: null,
        mediaUrl: msg.audio?.id ?? null,
        mediaMime: msg.audio?.mime_type ?? null,
      }
    case "video":
      return {
        type: "video",
        body: msg.video?.caption ?? null,
        mediaUrl: msg.video?.id ?? null,
        mediaMime: msg.video?.mime_type ?? null,
      }
    case "document":
      return {
        type: "document",
        body: msg.document?.filename ?? msg.document?.caption ?? null,
        mediaUrl: msg.document?.id ?? null,
        mediaMime: msg.document?.mime_type ?? null,
      }
    case "sticker":
      return {
        type: "sticker",
        body: null,
        mediaUrl: msg.sticker?.id ?? null,
        mediaMime: msg.sticker?.mime_type ?? null,
      }
    case "button":
      // Template quick-reply tap → deliver the button's PAYLOAD when we set one
      // (e.g. "CANCEL:933" → the cancel bot can target the exact booking),
      // falling back to the visible text ("Cancel booking") so the inbox still
      // renders something meaningful.
      return {
        type: "text",
        body: msg.button?.payload ?? msg.button?.text ?? null,
        mediaUrl: null,
        mediaMime: null,
      }
    default:
      return { type: msg.type, body: null, mediaUrl: null, mediaMime: null }
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text()
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (appSecret) {
    const sig = request.headers.get("x-hub-signature-256")
    if (!verifySignature(raw, sig, appSecret)) {
      console.warn("[whatsapp-webhook] bad signature")
      return NextResponse.json({ error: "bad_signature" }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail closed in production: without the app secret we cannot verify that a
    // payload genuinely came from Meta, so an attacker could forge inbound
    // messages (e.g. trigger the cancel bot). Refuse rather than trust it.
    console.error("[whatsapp-webhook] WHATSAPP_APP_SECRET not set in production — rejecting unsigned payload")
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 })
  } else {
    console.warn("[whatsapp-webhook] WHATSAPP_APP_SECRET not set — accepting unsigned payload (dev only)")
  }

  try {
    const body = JSON.parse(raw) as {
      entry?: {
        changes?: {
          value?: {
            metadata?: { phone_number_id?: string; display_phone_number?: string }
            contacts?: WAContact[]
            messages?: WAMessage[]
            statuses?: WAStatus[]
          }
        }[]
      }[]
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {}
        const contactName = value.contacts?.[0]?.profile?.name ?? null

        // Which studio owns the number this arrived on? Strict per-number
        // routing — no default fallback. Unmatched numbers are ignored so a
        // studio's inbox only ever shows its own clients.
        const studioRow = await resolveStudioByPhoneNumberId(
          value.metadata?.phone_number_id ?? null,
        )
        const studioId = studioRow?.id ?? null
        // Studio's admin-facing language (e.g. "ru"). When set, inbound text is
        // translated in the background and the inbox bubble shows the translation.
        const inboxLanguage = studioRow?.inboxLanguage ?? null
        // This studio's own WhatsApp config (used for trainer-forward / owner-copy).
        const waConfig = getConfigFor(studioRow)
        // This studio's own admin email — inbound copies go only here.
        const studioAdminEmail = studioRow?.users?.[0]?.email ?? null
        if (!studioId && (value.messages?.length ?? 0) > 0) {
          console.warn(
            "[whatsapp-webhook] inbound on unowned number, ignoring:",
            value.metadata?.phone_number_id,
          )
        }

        // -- Incoming messages --
        for (const msg of value.messages ?? []) {
          if (!studioId) continue

          // Client reacted to one of our messages: apply the emoji to that
          // message instead of saving a junk empty bubble. Empty emoji clears.
          if (msg.type === "reaction" && msg.reaction?.message_id) {
            const rtsSec = parseInt(msg.timestamp || "0", 10)
            const reactedAt = rtsSec > 0 ? new Date(rtsSec * 1000) : new Date()
            try {
              await prisma.whatsAppMessage.updateMany({
                where: { waMessageId: msg.reaction.message_id },
                data: { reaction: msg.reaction.emoji || null },
              })
              // A reaction is a customer-initiated inbound event — per Meta it
              // re-opens the 24h customer-service window just like a text reply.
              // We must bump the conversation's lastInboundAt so the composer
              // unlocks free-form replies; otherwise a client who "liked" our
              // automated message still shows as window-closed and the admin
              // can't write back. Find the conversation via the reacted message
              // first, falling back to the sender's phone tail.
              const reacted = await prisma.whatsAppMessage.findFirst({
                where: { waMessageId: msg.reaction.message_id },
                select: { conversationId: true },
              })
              let convoId = reacted?.conversationId ?? null
              if (!convoId) {
                const cv = await prisma.whatsAppConversation.findFirst({
                  where: {
                    studioId,
                    clientPhone: { contains: msg.from.slice(-10) },
                  },
                  select: { id: true },
                })
                convoId = cv?.id ?? null
              }
              if (convoId) {
                await prisma.whatsAppConversation.update({
                  where: { id: convoId },
                  data: { lastInboundAt: reactedAt, lastMessageAt: reactedAt },
                })
                // A reaction counts as an answer to the same-day reminder too
                // (owner request 2026-06-12): a client who just taps 👍 has
                // confirmed they're coming — the trainer must hear about it,
                // same as a text reply. Forward once and disarm.
                try {
                  const convo = await prisma.whatsAppConversation.findUnique({
                    where: { id: convoId },
                    select: { id: true, clientName: true, pendingReminderTrainerPhone: true },
                  })
                  if (convo?.pendingReminderTrainerPhone && msg.reaction.emoji) {
                    const fwd = await forwardClientReplyToTrainer({
                      trainerPhone: convo.pendingReminderTrainerPhone,
                      clientName: convo.clientName ?? "A client",
                      type: "text",
                      body: `${msg.reaction.emoji} (reacted to our message)`,
                      filename: null,
                      config: waConfig,
                    })
                    if (fwd.ok) {
                      await prisma.whatsAppConversation.update({
                        where: { id: convo.id },
                        data: { pendingReminderTrainerPhone: null },
                      })
                    } else {
                      console.warn("[whatsapp-webhook] forward reaction to trainer failed:", fwd.error)
                    }
                  }
                } catch (err) {
                  console.error("[whatsapp-webhook] reaction forward failed:", err)
                }
              }
            } catch (err) {
              console.error("[whatsapp-webhook] apply inbound reaction failed:", err)
            }
            continue
          }

          const { type, body: msgBody, mediaUrl, mediaMime } = describeIncomingMessage(msg)
          const tsSec = parseInt(msg.timestamp || "0", 10)
          const receivedAt = tsSec > 0 ? new Date(tsSec * 1000) : new Date()

          // Bank payment notification (e.g. BRI QRIS "Telah Diterima") routed to
          // this studio's WhatsApp number. Record it as a BankPayment and STOP -
          // it must NOT become a client conversation, an auto-assigned lead, or
          // reach a trainer.
          //
          // TRUST: we only take this path when the studio has PINNED its bank's
          // WhatsApp sender (`bankWhatsappSender`) AND the message is from EXACTLY
          // that number. Message content alone is NOT trusted - otherwise any
          // client could paste the bank's format and forge a "paid" record that
          // an admin might link to an unpaid class.
          if (type === "text" && msgBody) {
            const bankDigits = (studioRow?.bankWhatsappSender ?? "").replace(/\D/g, "")
            const fromDigits = msg.from.replace(/\D/g, "")
            if (bankDigits && fromDigits === bankDigits) {
              try {
                const res = await recordBankPayment({ studioId, text: msgBody, sender: msg.from, source: "wa" })
                if (res.status !== "ignored") {
                  console.log("[whatsapp-webhook] bank payment", res.status, {
                    from: msg.from,
                    id: res.status === "created" ? res.id : undefined,
                  })
                  continue // handled - do not route as a client message
                }
              } catch (err) {
                // Don't drop a real message if recording fails - fall through.
                console.error("[whatsapp-webhook] bank payment record failed:", err)
              }
            }
          }

          try {
            // Look up booking history for this phone — if we find one, assign
            // the most recent slot's trainer.
            const phone = msg.from
            // Only consider bookings IN THIS STUDIO — never assign a trainer
            // from another studio to this number's conversation.
            const recentBooking = await prisma.booking.findFirst({
              where: {
                clientPhone: { contains: phone.slice(-10) },
                status: "CONFIRMED",
                slot: { studioId },
              },
              orderBy: { createdAt: "desc" },
              include: { slot: { select: { trainerId: true } } },
            })
            let assignedTrainerId = recentBooking?.slot?.trainerId ?? null

            // Auto-assign an ad lead: a FIRST message from an unknown number with
            // no booking. When the studio has the toggle on, round-robin it to a
            // trainer in the pool instead of leaving it admin-only. The first
            // message is then forwarded to that trainer's personal WhatsApp below.
            let leadTrainer: { id: string; name: string; whatsapp: string } | null = null
            if (!assignedTrainerId && studioRow?.autoAssignLeads && studioRow?.whatsappEnabled) {
              const existingConvo = await prisma.whatsAppConversation.findFirst({
                where: { studioId, clientPhone: { contains: phone.slice(-10) } },
                select: { id: true },
              })
              if (!existingConvo) {
                leadTrainer = await pickNextLeadTrainer(studioId)
                if (leadTrainer) assignedTrainerId = leadTrainer.id
              }
            }

            const convo = await upsertConversation({
              studioId,
              clientPhone: phone,
              clientName: contactName ?? recentBooking?.clientName ?? null,
              assignedTrainerId,
            })

            // CTWA ad attribution (FIRST-TOUCH). When this inbound carries a
            // `referral` object the client tapped a paid Click-to-WhatsApp ad.
            // Stamp the conversation once (never overwrite an earlier ad-touch)
            // so we can later join this lead's clientPhone to bookings and know
            // which bookings/revenue the ad produced. Best-effort: a failure
            // here must never drop the message.
            if (msg.referral?.source_id && !convo.adSourceId) {
              try {
                await prisma.whatsAppConversation.update({
                  where: { id: convo.id },
                  data: {
                    adSourceType: msg.referral.source_type ?? null,
                    adSourceId: msg.referral.source_id,
                    adCtwaClid: msg.referral.ctwa_clid ?? null,
                    adHeadline: msg.referral.headline ?? null,
                    adSourceUrl: msg.referral.source_url ?? null,
                    adReferralAt: receivedAt,
                  },
                })
                console.log("[whatsapp-webhook] CTWA ad referral captured:", {
                  from: phone,
                  adId: msg.referral.source_id,
                  ctwaClid: msg.referral.ctwa_clid,
                })
              } catch (err) {
                console.error("[whatsapp-webhook] ad referral capture failed:", err)
              }
            }

            const saved = await appendInboundMessage({
              conversationId: convo.id,
              type,
              body: msgBody,
              mediaUrl,
              mediaMime,
              waMessageId: msg.id,
              receivedAt,
            })
            console.log("[whatsapp-webhook] saved inbound:", {
              from: phone,
              type,
              conversationId: convo.id,
              hasTrainer: !!assignedTrainerId,
            })

            // Ring like WhatsApp: a native push for every inbound client message
            // to the studio's admins and the assigned trainer, deep-linking into
            // this chat (category "message"). Deferred via after() so it runs
            // AFTER the 200 to Meta - the push fan-out (Expo + FCM + web-push per
            // recipient) used to add 2-6s to the response, which made Meta time
            // out and RE-DELIVER the same message. Guarded so a failure is silent.
            after(async () => {
            try {
              // Collect recipients (admin users + assigned trainer), including
              // their personal notification mode so each device gets the right
              // sound/vibration channel.
              const recipientRows = await prisma.user.findMany({
                where: {
                  studioId,
                  OR: [
                    { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
                    ...(assignedTrainerId
                      ? [{ trainer: { id: assignedTrainerId } }]
                      : []),
                  ],
                },
                select: { id: true, chatNotifMode: true, role: true, trainer: { select: { id: true } } },
              })
              const preview = type === "text" ? (msgBody ?? "").slice(0, 120) : `[${type}]`
              const title = convo.clientName ?? "New message"

              // Compute badge (unread conversation count) per user so the app
              // icon updates immediately when the push lands.
              const adminBadge = await prisma.whatsAppConversation.count({
                where: { studioId, unreadAdmin: { gt: 0 } },
              })
              const trainerBadgeFn = async (trainerId: string) =>
                prisma.whatsAppConversation.count({
                  where: { studioId, assignedTrainerId: trainerId, unreadTrainer: { gt: 0 } },
                })

              await Promise.all(
                recipientRows.flatMap((u) => {
                  const isAdmin = u.role === "ADMIN" || u.role === "SUPER_ADMIN"
                  const badgePromise = isAdmin
                    ? Promise.resolve(adminBadge)
                    : u.trainer ? trainerBadgeFn(u.trainer.id) : Promise.resolve(undefined)
                  return [
                    // Native push (Android/iOS app) - respect user's sound/vibration preference.
                    badgePromise.then((badge) =>
                      sendPush({
                        userId: u.id,
                        title,
                        body: preview || "New message",
                        category: "message",
                        data: { conversationId: convo.id },
                        chatNotifMode: (u.chatNotifMode as "SOUND_VIBRATION" | "VIBRATION_ONLY" | "SOUND_ONLY") ?? "SOUND_VIBRATION",
                        badge,
                      })
                    ),
                    // Web push (PWA on phone, no native app needed).
                    sendWebPush({
                      userId: u.id,
                      title,
                      body: preview || "New message",
                      data: { conversationId: convo.id },
                    }),
                  ]
                }),
              )
            } catch (err) {
              console.warn("[whatsapp-webhook] message push failed:", err)
            }
            })

            // Auto-assigned ad lead → ping the trainer's personal WhatsApp once
            // with this first message (they have no open 24h window, so via the
            // approved forward template). The chat itself already shows in their
            // cabinet inbox via assignedTrainerId.
            if (leadTrainer && leadTrainer.whatsapp) {
              try {
                const fwd = await forwardClientReplyToTrainer({
                  trainerPhone: leadTrainer.whatsapp,
                  clientName: convo.clientName ?? contactName ?? "A new lead",
                  type,
                  body: msgBody,
                  filename: msg.document?.filename ?? null,
                  config: waConfig,
                })
                if (!fwd.ok) console.warn("[whatsapp-webhook] forward lead to trainer failed:", fwd.error)
              } catch (err) {
                console.error("[whatsapp-webhook] forward lead to trainer threw:", err)
              }
            }

            // Self-service cancellation bot. No-ops unless the text is a
            // 3-digit ticket code or a pending "1"/"0" reply, so it's safe to
            // run on every inbound. Awaited so the reply is sent before we 200.
            try {
              await handleCancelBotMessage({
                studioId,
                conversationId: convo.id,
                clientPhone: phone,
                text: msgBody,
              })
            } catch (err) {
              console.error("[whatsapp-webhook] cancel bot failed:", err)
            }

            // Forward the client's FIRST reply to the same-day class reminder
            // to the class trainer's WhatsApp, so the trainer knows who's
            // still coming. The today-reminder cron armed this by stashing the
            // trainer's number on the conversation; we clear it on a successful
            // forward so only the first reply reaches the trainer. Trainers
            // have no open 24h window, so this goes via an approved template.
            if (convo.pendingReminderTrainerPhone) {
              try {
                const clientName =
                  convo.clientName ?? contactName ?? recentBooking?.clientName ?? "A client"
                const fwd = await forwardClientReplyToTrainer({
                  trainerPhone: convo.pendingReminderTrainerPhone,
                  clientName,
                  type,
                  body: msgBody,
                  filename: msg.document?.filename ?? null,
                  config: waConfig,
                })
                if (fwd.ok) {
                  // First reply delivered → disarm so later messages don't
                  // keep pinging the trainer.
                  await prisma.whatsAppConversation.update({
                    where: { id: convo.id },
                    data: { pendingReminderTrainerPhone: null },
                  })
                } else {
                  // Keep it armed (e.g. template still pending approval) so a
                  // later reply retries once it can actually deliver.
                  console.warn(
                    "[whatsapp-webhook] forward reply to trainer failed:",
                    fwd.error,
                  )
                }
              } catch (err) {
                console.error("[whatsapp-webhook] forward reply to trainer threw:", err)
              }
            }

            // Fire-and-forget translation: if the studio is set up with an
            // admin-facing language and the inbound has text we can translate,
            // detect+translate via Claude and stash the result on the message
            // row. The bubble UI prefers translatedBody when present so the
            // admin sees the chat in their language without any further work.
            // Also updates conversation.clientLanguage so outbound replies can
            // be translated back without re-detecting.
            if (
              inboxLanguage &&
              msgBody &&
              msgBody.trim().length > 0 &&
              (type === "text" || type === "image" || type === "video")
            ) {
              void (async () => {
                try {
                  const t = await translateAndDetect({
                    text: msgBody,
                    targetLang: inboxLanguage,
                  })
                  if (!t.ok) {
                    if (t.error !== "ANTHROPIC_API_KEY not set") {
                      console.warn("[whatsapp-webhook] translate inbound failed:", t.error)
                    }
                    return
                  }
                  const isSame = t.sourceLang === inboxLanguage
                  await prisma.whatsAppMessage.update({
                    where: { id: saved.id },
                    data: {
                      detectedLang: t.sourceLang,
                      translatedBody: isSame ? null : t.translated,
                      translatedVia: isSame ? null : t.provider,
                    },
                  })
                  // Remember the client's language for outbound translation.
                  // Only update when we actually got a confident detection (a
                  // real 2-letter code) — "und" stays put.
                  if (
                    t.sourceLang &&
                    t.sourceLang !== "und" &&
                    t.sourceLang !== convo.clientLanguage
                  ) {
                    await prisma.whatsAppConversation.update({
                      where: { id: convo.id },
                      data: { clientLanguage: t.sourceLang },
                    })
                  }
                } catch (err) {
                  console.error("[whatsapp-webhook] translate threw:", err)
                }
              })()
            }

            // Fire-and-forget WhatsApp copy to owner's personal number via
            // approved template (no 24h window dependency). Skipped silently
            // until WHATSAPP_TEMPLATE_INBOUND_COPY env is set (template still
            // PENDING Meta approval at the time of this commit).
            void forwardInboundToOwner({
              fromPhone: phone,
              fromName: contactName,
              type,
              body: msgBody,
              filename: msg.document?.filename ?? null,
              config: waConfig,
            })
              .then((r) => {
                if (
                  !r.ok &&
                  r.error !== "skip_owner_self" &&
                  r.error !== "WHATSAPP_TEMPLATE_INBOUND_COPY not set" &&
                  r.error !== "OWNER_NOTIFY_PHONE not set"
                ) {
                  console.warn(
                    "[whatsapp-webhook] WA forward to owner failed:",
                    r.error,
                  )
                }
              })
              .catch((err) => {
                console.error("[whatsapp-webhook] WA forward threw:", err)
              })

            // Email copy to the studio admin — gated by the Notifications
            // panel toggle. Runs in parallel with the WA path.
            if (studioRow?.emailAdminWaCopy !== false)
            void (async () => {
              try {
                let mediaAttachment:
                  | { bytes: Buffer; mimeType: string; filename: string }
                  | null = null
                if (mediaUrl && type !== "text") {
                  const fetched = await fetchMetaMedia(mediaUrl, waConfig)
                  if (fetched.ok) {
                    const ext = (fetched.mimeType.split("/")[1] || "bin").split(";")[0]
                    const filename =
                      msg.document?.filename ||
                      `${type}-${msg.id.slice(-8)}.${ext}`
                    mediaAttachment = {
                      bytes: Buffer.from(fetched.bytes),
                      mimeType: fetched.mimeType,
                      filename,
                    }
                  } else {
                    console.warn(
                      "[whatsapp-webhook] media fetch for email failed:",
                      fetched.error,
                    )
                  }
                }
                const r = await sendInboundWhatsAppCopy({
                  fromPhone: phone,
                  fromName: contactName,
                  type,
                  body: msgBody,
                  media: mediaAttachment,
                  receivedAt,
                  toEmail: studioAdminEmail,
                  studioName: studioRow?.name ?? null,
                })
                if (!r.ok) {
                  console.warn(
                    "[whatsapp-webhook] email copy to owner failed:",
                    r.error,
                  )
                }
              } catch (err) {
                console.error("[whatsapp-webhook] email copy threw:", err)
              }
            })()
          } catch (err) {
            console.error("[whatsapp-webhook] persist inbound failed:", err)
          }
        }

        // -- Delivery / read status updates --
        for (const st of value.statuses ?? []) {
          const errDetail = st.errors?.[0]?.error_data?.details ?? st.errors?.[0]?.title ?? null
          // Detect the FIRST transition to "failed" (Meta may resend statuses)
          // BEFORE updateMessageStatus overwrites the previous status.
          let firstFail: {
            studioId: string
            conversationId: string
            clientName: string | null
            clientPhone: string
          } | null = null
          if (st.status === "failed") {
            try {
              const failedMsg = await prisma.whatsAppMessage.findFirst({
                where: { waMessageId: st.id, direction: "OUTBOUND", status: { not: "failed" } },
                select: {
                  conversation: {
                    select: { id: true, studioId: true, clientName: true, clientPhone: true },
                  },
                },
              })
              if (failedMsg?.conversation) {
                firstFail = {
                  studioId: failedMsg.conversation.studioId,
                  conversationId: failedMsg.conversation.id,
                  clientName: failedMsg.conversation.clientName,
                  clientPhone: failedMsg.conversation.clientPhone,
                }
              }
            } catch (err) {
              console.error("[whatsapp-webhook] failed-lookup error:", err)
            }
          }
          try {
            await updateMessageStatus({
              waMessageId: st.id,
              status: st.status,
              errorDetail: errDetail,
            })
          } catch (err) {
            console.error("[whatsapp-webhook] status update failed:", err)
          }
          // A FAILED delivery is the silent killer (bad number, template
          // paused, quality drop) — make it loud and queryable.
          if (st.status === "failed") {
            void elogError("webhook:status", "message delivery FAILED", {
              waMessageId: st.id,
              recipient: st.recipient_id ?? null,
              detail: errDetail,
            })
            // ...and loud for HUMANS: push the studio's admins + badge the chat
            // in the inbox (first failed status only, not Meta's retries).
            if (firstFail) {
              void notifyDeliveryFailure({ ...firstFail, detail: errDetail })
            }
          }
          // Mirror delivery status onto a matching booking-OTP send, so the
          // booking widget can tell a client their number isn't on WhatsApp
          // (status "failed") instead of leaving them waiting for a code.
          try {
            await prisma.bookingOtp.updateMany({
              where: { waMessageId: st.id },
              data: { status: st.status, statusError: errDetail },
            })
          } catch (err) {
            console.error("[whatsapp-webhook] otp status update failed:", err)
          }
          if (st.status === "failed" || st.errors?.length) {
            console.warn("[whatsapp-webhook] status:", st.status, st.id, errDetail)
          }
        }
      }
    }
  } catch (err) {
    console.error("[whatsapp-webhook] parse error:", err)
  }
  // Always 200 — Meta retries aggressively on non-2xx.
  return NextResponse.json({ ok: true })
}
