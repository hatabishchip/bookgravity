// WhatsApp Cloud API (Meta) sender.
//
// Required env:
//   WHATSAPP_PHONE_NUMBER_ID  — numeric ID of the sender number (from WhatsApp Manager)
//   WHATSAPP_ACCESS_TOKEN     — permanent System User token with whatsapp_business_messaging
//   WHATSAPP_API_VERSION      — optional, defaults to v21.0
//
// If WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN are missing, all sends
// no-op and log a warning so the booking flow stays unaffected during setup.

import { format, parseISO } from "date-fns"

const GRAPH_BASE = "https://graph.facebook.com"

// Format "YYYY-MM-DD" → "Friday, 28 May" for the trainer-notification body.
// Falls back to the raw value if parsing fails so we never break the message.
function formatLongDate(ymd: string): string {
  try {
    return format(parseISO(ymd), "EEEE, d MMMM")
  } catch {
    return ymd
  }
}

type CloudConfig = {
  phoneNumberId: string
  accessToken: string
  apiVersion: string
}

function getConfig(): CloudConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0"
  if (!phoneNumberId || !accessToken) return null
  return { phoneNumberId, accessToken, apiVersion }
}

/**
 * Per-studio config preferred over the env-var fallback. Returns null if
 * neither source has both phoneNumberId + accessToken — caller no-ops.
 */
export function getConfigFor(studio: {
  whatsappPhoneNumberId: string | null
  whatsappAccessToken: string | null
} | null | undefined): CloudConfig | null {
  if (studio?.whatsappPhoneNumberId && studio.whatsappAccessToken) {
    return {
      phoneNumberId: studio.whatsappPhoneNumberId,
      accessToken: studio.whatsappAccessToken,
      apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    }
  }
  return getConfig()
}

/** Strip everything but digits — Meta requires bare international number. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "")
}

type SendResult = { ok: true; messageId: string } | { ok: false; error: string }

async function postMessage(cfg: CloudConfig, body: unknown): Promise<SendResult> {
  const url = `${GRAPH_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[]
      error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } }
    }
    if (!res.ok) {
      const detail = json.error?.error_data?.details || json.error?.message || `HTTP ${res.status}`
      return { ok: false, error: detail }
    }
    return { ok: true, messageId: json.messages?.[0]?.id ?? "" }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Upload a media file (Buffer / Blob) to Meta and return its media_id.
 *
 * Meta limits: images 5 MB, video 16 MB, audio 16 MB, documents 100 MB.
 * The returned id is single-use — pass it to sendWhatsAppMedia immediately
 * (Meta keeps it valid for ~30 days but the API contract treats it as
 * one-shot per send).
 */
export async function uploadMediaToMeta(
  data: Buffer | Blob,
  mimeType: string,
  filename = "upload",
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const cfg = getConfig()
  if (!cfg) return { ok: false, error: "not_configured" }
  try {
    const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)], { type: mimeType })
    const form = new FormData()
    form.append("file", blob, filename)
    form.append("type", mimeType)
    form.append("messaging_product", "whatsapp")
    const url = `${GRAPH_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/media`
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      body: form,
    })
    const json = (await res.json().catch(() => ({}))) as {
      id?: string
      error?: { message?: string; error_data?: { details?: string } }
    }
    if (!res.ok || !json.id) {
      const detail = json.error?.error_data?.details || json.error?.message || `HTTP ${res.status}`
      return { ok: false, error: detail }
    }
    return { ok: true, id: json.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Send a previously-uploaded media file to a recipient. Pair with
 * `uploadMediaToMeta` to upload, then `sendWhatsAppMedia` to deliver.
 */
export async function sendWhatsAppMedia(opts: {
  toPhone: string
  type: "image" | "video" | "audio" | "document" | "sticker"
  mediaId: string
  caption?: string
  filename?: string // documents only
}): Promise<SendResult> {
  const cfg = getConfig()
  if (!cfg) return { ok: false, error: "not_configured" }
  const to = normalizePhone(opts.toPhone)
  if (!to) return { ok: false, error: "empty_phone" }
  const mediaObj: Record<string, string> = { id: opts.mediaId }
  // Captions only allowed for image / video (NOT sticker / audio / document).
  if (opts.caption && (opts.type === "image" || opts.type === "video")) {
    mediaObj.caption = opts.caption
  }
  if (opts.type === "document" && opts.filename) {
    mediaObj.filename = opts.filename
  }
  return postMessage(cfg, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: opts.type,
    [opts.type]: mediaObj,
  })
}

/**
 * Resolve a media_id (received via webhook or upload) into Meta's short-lived
 * download URL + bytes. Returns the raw bytes ready to stream back to the
 * browser. URL itself expires after a few minutes so we never cache it; the
 * caller is expected to add HTTP-level caching.
 */
export async function fetchMetaMedia(
  mediaId: string,
): Promise<{ ok: true; mimeType: string; bytes: ArrayBuffer } | { ok: false; error: string }> {
  const cfg = getConfig()
  if (!cfg) return { ok: false, error: "not_configured" }
  try {
    // Step 1: resolve media_id → temporary signed URL.
    const metaRes = await fetch(`${GRAPH_BASE}/${cfg.apiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    })
    if (!metaRes.ok) {
      return { ok: false, error: `meta lookup HTTP ${metaRes.status}` }
    }
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string }
    if (!meta.url) return { ok: false, error: "no_url_in_meta_response" }

    // Step 2: download the bytes (must include Authorization).
    const fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    })
    if (!fileRes.ok) {
      return { ok: false, error: `download HTTP ${fileRes.status}` }
    }
    const bytes = await fileRes.arrayBuffer()
    return { ok: true, mimeType: meta.mime_type || "application/octet-stream", bytes }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Update the WhatsApp Business profile picture from a data: URI (the format
 * we store studio logos in). Resilient — returns ok:false on any failure
 * so callers can fire-and-forget without breaking the caller's flow.
 *
 * Three-step Meta flow:
 *   1. POST /{app_id}/uploads      — open resumable upload session
 *   2. POST /{session_id}          — push raw bytes (OAuth scheme)
 *   3. POST /{phone_number_id}/whatsapp_business_profile
 *                                  — bind handle as profile_picture_handle
 */
export async function setWhatsAppProfilePictureFromDataUrl(
  dataUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = getConfig()
  if (!cfg) return { ok: false, error: "not_configured" }
  const appId = process.env.WHATSAPP_APP_ID || "1872775433439200"
  if (!dataUrl.startsWith("data:")) return { ok: false, error: "not_a_data_uri" }
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|jpg|webp));base64,(.+)$/)
  if (!m) return { ok: false, error: "unsupported_mime" }
  const mimeType = m[1] === "image/jpg" ? "image/jpeg" : m[1]
  const bytes = Buffer.from(m[2], "base64")

  try {
    // 1) start upload session
    const startUrl = `${GRAPH_BASE}/${cfg.apiVersion}/${appId}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${encodeURIComponent(cfg.accessToken)}`
    const startRes = await fetch(startUrl, { method: "POST" })
    const startJson = (await startRes.json().catch(() => ({}))) as {
      id?: string
      error?: { message?: string }
    }
    if (!startRes.ok || !startJson.id) {
      return { ok: false, error: startJson.error?.message ?? `start HTTP ${startRes.status}` }
    }
    // 2) upload bytes
    const uploadRes = await fetch(`${GRAPH_BASE}/${cfg.apiVersion}/${startJson.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${cfg.accessToken}`, file_offset: "0" },
      body: new Uint8Array(bytes),
    })
    const uploadJson = (await uploadRes.json().catch(() => ({}))) as {
      h?: string
      error?: { message?: string }
    }
    if (!uploadRes.ok || !uploadJson.h) {
      return { ok: false, error: uploadJson.error?.message ?? `upload HTTP ${uploadRes.status}` }
    }
    // 3) attach handle
    const profileRes = await fetch(
      `${GRAPH_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/whatsapp_business_profile`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          profile_picture_handle: uploadJson.h,
        }),
      },
    )
    const profileJson = (await profileRes.json().catch(() => ({}))) as {
      success?: boolean
      error?: { message?: string }
    }
    if (!profileRes.ok || !profileJson.success) {
      return {
        ok: false,
        error: profileJson.error?.message ?? `profile HTTP ${profileRes.status}`,
      }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Mark an inbound message as read. Sends Meta the "read" status so the
 * blue double-check appears on the client's WhatsApp. The wamid is the
 * one we got from the inbound webhook (stored in WhatsAppMessage.waMessageId).
 *
 * Meta silently 200s for invalid / already-read wamids, so failures here
 * are non-fatal. We surface errors so callers can decide whether to retry.
 */
export async function markMessageRead(
  waMessageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = getConfig()
  if (!cfg) return { ok: false, error: "not_configured" }
  if (!waMessageId) return { ok: false, error: "empty_wamid" }
  try {
    const url = `${GRAPH_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: waMessageId,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return {
        ok: false,
        error: (j as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`,
      }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Free-form text message. Works ONLY inside a 24h customer service window
 * (i.e. the recipient must have sent us a message in the last 24 hours).
 * Use for trainer notifications once they've replied to the bot at least once.
 */
export async function sendWhatsAppText(toPhone: string, text: string): Promise<SendResult> {
  const cfg = getConfig()
  if (!cfg) {
    console.warn("[whatsapp-cloud] missing WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN — skip")
    return { ok: false, error: "not_configured" }
  }
  const to = normalizePhone(toPhone)
  if (!to) return { ok: false, error: "empty_phone" }
  return postMessage(cfg, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text, preview_url: false },
  })
}

/**
 * Template message — required for messages outside the 24h window.
 * `variables` are positional and fill {{1}}, {{2}}, ... in the template body.
 */
export async function sendWhatsAppTemplate(opts: {
  toPhone: string
  templateName: string
  languageCode: string // e.g. "en", "en_US", "id"
  variables?: string[]
}): Promise<SendResult> {
  const cfg = getConfig()
  if (!cfg) {
    console.warn("[whatsapp-cloud] missing WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN — skip")
    return { ok: false, error: "not_configured" }
  }
  const to = normalizePhone(opts.toPhone)
  if (!to) return { ok: false, error: "empty_phone" }

  const components = opts.variables?.length
    ? [
        {
          type: "body",
          parameters: opts.variables.map((v) => ({ type: "text", text: v })),
        },
      ]
    : undefined

  return postMessage(cfg, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode },
      ...(components ? { components } : {}),
    },
  })
}

// --- High-level helpers wired to your booking domain --------------------------

/**
 * Send booking confirmation to client. Uses a template because the client
 * has (almost certainly) never written to the business number first.
 *
 * Template name + language are read from env so you can edit the template
 * in Meta without redeploying. Defaults match the names suggested in setup:
 *   WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION (default: booking_confirmation)
 *   WHATSAPP_TEMPLATE_LANG               (default: en)
 *
 * Expected template body (4 positional vars):
 *   Hi {{1}}! Your booking at Gravity Stretching Canggu is confirmed.
 *   Date: {{2}}   Time: {{3}}   Code: {{4}}
 */
export async function sendClientBookingConfirmationWA(opts: {
  clientPhone: string
  clientName: string
  date: string
  time: string
  ticketCode: string
}): Promise<SendResult> {
  const templateName =
    process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION || "booking_confirmed"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
  return sendWhatsAppTemplate({
    toPhone: opts.clientPhone,
    templateName,
    languageCode: lang,
    variables: [opts.clientName, opts.date, opts.time, opts.ticketCode],
  })
}

/**
 * Notify trainer of a new booking. Tries free-form text first (works if
 * trainer is in the 24h window), falls back to a utility template if not.
 *
 * Privacy: we deliberately DON'T include the client's phone number in
 * either path — trainers see only names. The slot's overall occupancy is
 * surfaced as "Booked X/Y: Anna, John" so the trainer knows how full the
 * class is at a glance.
 *
 * Template body (5 vars):
 *   New booking
 *   You have a new booking for your class.
 *   Date: {{1}}
 *   Time: {{2}}
 *   Booked {{3}}/{{4}}: {{5}}
 *   Open the admin to view details.
 */
export async function sendTrainerBookingNotificationWA(opts: {
  trainerPhone: string
  trainerName: string
  date: string
  time: string
  /** All client names already booked on this slot (including the new one). */
  clientNames: string[]
  /** Total bookings on the slot after the new one(s) landed. */
  bookedCount: number
  /** Slot capacity. */
  maxCapacity: number
}): Promise<SendResult> {
  const namesLine = opts.clientNames.join(", ")
  // Owner-specified format. Date is rendered long-form (e.g. "Friday, 28 May")
  // without a "Date:" prefix. Time keeps the prefix. Free-form text isn't
  // subject to Meta's template character ratio rule so we can keep it terse.
  //
  //   New booking
  //
  //   Friday, 28 May
  //   Time: 7:00-9:00
  //   Booked 1/6: test 88
  const text = [
    `New booking`,
    ``,
    formatLongDate(opts.date),
    `Time: ${opts.time}`,
    `Booked ${opts.bookedCount}/${opts.maxCapacity}: ${namesLine}`,
  ].join("\n")

  const textResult = await sendWhatsAppText(opts.trainerPhone, text)
  if (textResult.ok) return textResult

  // Re-engagement / 24h window errors → fall back to template.
  // Meta error code 131047 = "Message failed to send because more than 24
  // hours have passed since the customer last replied."
  if (
    textResult.error.includes("131047") ||
    textResult.error.toLowerCase().includes("re-engagement") ||
    textResult.error.toLowerCase().includes("24 hours")
  ) {
    const templateName =
      process.env.WHATSAPP_TEMPLATE_TRAINER_NOTIFICATION || "trainer_new_booking"
    const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
    // Two template variants are live in our WABA. The new, terse one
    // (`trainer_class_booking`) carries 4 variables but is still PENDING
    // Meta approval; the old one (`trainer_new_booking`) carries 5 and is
    // APPROVED. We dispatch the right shape based on whatever env points
    // at, so we can swap to the new template the moment Meta approves it
    // without a code change.
    const isV2 = templateName === "trainer_class_booking"
    // Use long-form date ("Friday, 28 May") as the {{1}} variable so the
    // template's "Date: {{1}}" line renders like the owner-specified format
    // even when we fall back to the template path.
    const longDate = formatLongDate(opts.date)
    const variables = isV2
      ? [longDate, opts.time, `${opts.bookedCount}/${opts.maxCapacity}`, namesLine || "—"]
      : [
          longDate,
          opts.time,
          String(opts.bookedCount),
          String(opts.maxCapacity),
          namesLine || "—",
        ]
    return sendWhatsAppTemplate({
      toPhone: opts.trainerPhone,
      templateName,
      languageCode: lang,
      variables,
    })
  }
  return textResult
}

/**
 * Forward an inbound message to the owner's personal WhatsApp number as a
 * copy. Best-effort: returns success/failure but never throws so it can be
 * fire-and-forgotten from the webhook hot path.
 *
 * Behaviour by inbound type:
 *   • text → free-form text to owner prefixed with the sender's name+phone
 *   • image / video / audio / sticker / document — download bytes from Meta,
 *     re-upload, and send through the Cloud API with a caption that names
 *     the sender. Captions only stick to image/video (Meta's rule).
 *
 * Free-form sends to the owner only work inside the 24h customer-service
 * window — the owner must have written to the business number within the
 * past 24h. If that window is closed Meta will return error 131047 / 132015
 * and this helper will silently return ok:false. The webhook ignores the
 * result so a closed-window failure doesn't impact the inbox persistence.
 *
 * The owner's phone comes from env (OWNER_NOTIFY_PHONE) so we don't bake a
 * personal number into the codebase.
 */
export async function forwardInboundToOwner(opts: {
  /** Bare digits of the sender (Meta's `from`). */
  fromPhone: string
  /** Sender's WhatsApp profile name if Meta provided it. */
  fromName?: string | null
  /** Inbound message type. */
  type: string
  /** Text body OR media caption (whichever applies). */
  body: string | null
  /** Meta media_id for media types. We re-fetch and re-upload it. */
  mediaId?: string | null
  /** Filename for documents (optional). */
  filename?: string | null
}): Promise<SendResult> {
  const ownerPhone = process.env.OWNER_NOTIFY_PHONE
  if (!ownerPhone) {
    return { ok: false, error: "OWNER_NOTIFY_PHONE not set" }
  }
  const cfg = getConfig()
  if (!cfg) return { ok: false, error: "not_configured" }

  // Anti-loop: never forward a message that the owner themselves sent to the
  // business number — they'd just receive an echo of their own text.
  const ownerDigits = normalizePhone(ownerPhone)
  if (normalizePhone(opts.fromPhone) === ownerDigits) {
    return { ok: false, error: "skip_owner_self" }
  }

  // Pretty sender label: "Anna (+62 821-…-405)" or just the phone if no name.
  const senderLabel =
    opts.fromName?.trim()
      ? `${opts.fromName.trim()} (+${opts.fromPhone})`
      : `+${opts.fromPhone}`

  // Type-specific header so the owner can tell at a glance what they're getting.
  const header = (() => {
    switch (opts.type) {
      case "text":
        return `📨 ${senderLabel}`
      case "image":
        return `📷 ${senderLabel} — photo`
      case "video":
        return `🎬 ${senderLabel} — video`
      case "audio":
        return `🎤 ${senderLabel} — voice`
      case "sticker":
        return `💬 ${senderLabel} — sticker`
      case "document":
        return `📄 ${senderLabel} — document${opts.filename ? `: ${opts.filename}` : ""}`
      default:
        return `📨 ${senderLabel} — ${opts.type}`
    }
  })()

  // Text path is simpler: one Cloud API call.
  if (opts.type === "text") {
    const text = opts.body ? `${header}\n${opts.body}` : header
    return sendWhatsAppText(ownerPhone, text)
  }

  // Media path: re-fetch from Meta, re-upload, send. If anything fails we
  // fall back to a plain-text notice so the owner at least sees that
  // something came in.
  if (!opts.mediaId) {
    return sendWhatsAppText(ownerPhone, header)
  }
  const fetched = await fetchMetaMedia(opts.mediaId)
  if (!fetched.ok) {
    return sendWhatsAppText(ownerPhone, `${header}\n(failed to fetch media: ${fetched.error})`)
  }
  const fileName = opts.filename || `forward-${Date.now()}`
  const uploaded = await uploadMediaToMeta(
    Buffer.from(fetched.bytes),
    fetched.mimeType,
    fileName,
  )
  if (!uploaded.ok) {
    return sendWhatsAppText(ownerPhone, `${header}\n(failed to upload media: ${uploaded.error})`)
  }

  // Map inbound type → outbound type. Sticker and document keep their shape;
  // audio/image/video too. Unknown types fall back to "document" so Meta still
  // accepts the send.
  const outType: "image" | "video" | "audio" | "document" | "sticker" =
    opts.type === "image" ||
    opts.type === "video" ||
    opts.type === "audio" ||
    opts.type === "sticker"
      ? opts.type
      : "document"

  // Caption travels only on image/video per Meta's rules; for everything else
  // we send the header as a separate text message right before the media so
  // the owner still sees who it's from.
  if (outType === "image" || outType === "video") {
    const cap = opts.body ? `${header}\n${opts.body}` : header
    return sendWhatsAppMedia({
      toPhone: ownerPhone,
      type: outType,
      mediaId: uploaded.id,
      caption: cap,
    })
  }
  // Non-captionable media: send the header as a text first, ignore its result.
  await sendWhatsAppText(ownerPhone, header)
  return sendWhatsAppMedia({
    toPhone: ownerPhone,
    type: outType,
    mediaId: uploaded.id,
    filename: outType === "document" ? fileName : undefined,
  })
}
