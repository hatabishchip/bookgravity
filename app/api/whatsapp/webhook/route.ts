import { NextRequest, NextResponse } from "next/server"
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
  timestamp: string
}
type WAContact = { wa_id: string; profile?: { name?: string } }

/** Best-effort lookup of the default studio. We don't have studio mapping in
 *  the webhook payload (Meta sends only WABA id) — for single-studio deployments
 *  this is fine. Future: map WABA id → Studio. */
async function getDefaultStudioId(): Promise<string | null> {
  const studio =
    (await prisma.studio.findFirst({ where: { isDefault: true }, select: { id: true } })) ||
    (await prisma.studio.findFirst({ select: { id: true } }))
  return studio?.id ?? null
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
  } else {
    console.warn("[whatsapp-webhook] WHATSAPP_APP_SECRET not set — accepting unsigned payload")
  }

  try {
    const body = JSON.parse(raw) as {
      entry?: {
        changes?: {
          value?: {
            contacts?: WAContact[]
            messages?: WAMessage[]
            statuses?: WAStatus[]
          }
        }[]
      }[]
    }
    const studioId = await getDefaultStudioId()
    if (!studioId) {
      console.warn("[whatsapp-webhook] no Studio in DB — skipping persistence")
    }
    // Studio's admin-facing language (e.g. "ru" for Canggu/Ubud). When set,
    // every inbound message gets translated in the background and the
    // bubble in /admin/inbox renders the translation as the main text.
    const studioRow = studioId
      ? await prisma.studio.findUnique({
          where: { id: studioId },
          select: { inboxLanguage: true, whatsappPhoneNumberId: true, whatsappAccessToken: true },
        })
      : null
    const inboxLanguage = studioRow?.inboxLanguage ?? null
    // This studio's own WhatsApp config (per-studio number; falls back to global).
    const waConfig = getConfigFor(studioRow)

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {}
        const contactName = value.contacts?.[0]?.profile?.name ?? null

        // -- Incoming messages --
        for (const msg of value.messages ?? []) {
          if (!studioId) continue

          // Client reacted to one of our messages: apply the emoji to that
          // message instead of saving a junk empty bubble. Empty emoji clears.
          if (msg.type === "reaction" && msg.reaction?.message_id) {
            try {
              await prisma.whatsAppMessage.updateMany({
                where: { waMessageId: msg.reaction.message_id },
                data: { reaction: msg.reaction.emoji || null },
              })
            } catch (err) {
              console.error("[whatsapp-webhook] apply inbound reaction failed:", err)
            }
            continue
          }

          const { type, body: msgBody, mediaUrl, mediaMime } = describeIncomingMessage(msg)
          const tsSec = parseInt(msg.timestamp || "0", 10)
          const receivedAt = tsSec > 0 ? new Date(tsSec * 1000) : new Date()

          try {
            // Look up booking history for this phone — if we find one, assign
            // the most recent slot's trainer.
            const phone = msg.from
            const recentBooking = await prisma.booking.findFirst({
              where: { clientPhone: { contains: phone.slice(-10) }, status: "CONFIRMED" },
              orderBy: { createdAt: "desc" },
              include: { slot: { select: { trainerId: true } } },
            })
            const assignedTrainerId = recentBooking?.slot?.trainerId ?? null

            const convo = await upsertConversation({
              studioId,
              clientPhone: phone,
              clientName: contactName ?? recentBooking?.clientName ?? null,
              assignedTrainerId,
            })
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
                  await prisma.whatsAppMessage.update({
                    where: { id: saved.id },
                    data: {
                      detectedLang: t.sourceLang,
                      translatedBody:
                        t.sourceLang === inboxLanguage ? null : t.translated,
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

            // Email copy to owner — always works regardless of WhatsApp
            // window or template status. Runs in parallel with the WA path.
            void (async () => {
              try {
                let mediaAttachment:
                  | { bytes: Buffer; mimeType: string; filename: string }
                  | null = null
                if (mediaUrl && type !== "text") {
                  const fetched = await fetchMetaMedia(mediaUrl)
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
          try {
            await updateMessageStatus({
              waMessageId: st.id,
              status: st.status,
              errorDetail: errDetail,
            })
          } catch (err) {
            console.error("[whatsapp-webhook] status update failed:", err)
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
