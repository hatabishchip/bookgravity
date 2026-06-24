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
export function formatLongDate(ymd: string): string {
  try {
    return format(parseISO(ymd), "EEEE, d MMMM")
  } catch {
    return ymd
  }
}

export type CloudConfig = {
  phoneNumberId: string
  accessToken: string
  apiVersion: string
}

// The two per-studio WhatsApp fields. Each studio configures its OWN number +
// token in its own Facebook/Meta account; getConfigFor() resolves them and
// falls back to the global env (the primary studio's number) when unset.
export type StudioWA = {
  whatsappPhoneNumberId: string | null
  whatsappAccessToken: string | null
} | null | undefined

export function getConfig(): CloudConfig | null {
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
  const global = getConfig()
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0"
  // Prefer the studio's OWN number. Pair it with the studio's own token if it
  // has one, otherwise the shared WABA token from env — every number on the
  // same WhatsApp Business Account uses the same system-user token, so a studio
  // that self-onboarded a number (its phoneNumberId is set but token is null)
  // must still send FROM ITS OWN number, not fall back to the default studio's.
  if (studio?.whatsappPhoneNumberId) {
    const accessToken = studio.whatsappAccessToken || global?.accessToken
    if (accessToken) {
      return { phoneNumberId: studio.whatsappPhoneNumberId, accessToken, apiVersion }
    }
  }
  return global
}

export type WhatsAppHealth =
  | { ok: true; displayPhone?: string; verifiedName?: string; qualityRating?: string }
  | { ok: false; error: string }

/**
 * Live health check: ask Meta to confirm the studio's phone-number ID +
 * access token are valid right now. Returns the verified business name /
 * display phone / quality rating on success, or Meta's error message. This is
 * a real round-trip, not just a "creds present" flag.
 */
export async function checkWhatsAppHealth(studio: {
  whatsappPhoneNumberId: string | null
  whatsappAccessToken: string | null
}): Promise<WhatsAppHealth> {
  const cfg = getConfigFor(studio)
  if (!cfg) return { ok: false, error: "Not configured" }
  try {
    const url = `${GRAPH_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } })
    const json = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string
      verified_name?: string
      quality_rating?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` }
    }
    return {
      ok: true,
      displayPhone: json.display_phone_number,
      verifiedName: json.verified_name,
      qualityRating: json.quality_rating,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }
}

/** Strip everything but digits — Meta requires bare international number. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "")
}

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string }

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
  config?: CloudConfig | null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const cfg = config ?? getConfig()
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
  config?: CloudConfig | null
}): Promise<SendResult> {
  const cfg = opts.config ?? getConfig()
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
  config?: CloudConfig | null,
): Promise<{ ok: true; mimeType: string; bytes: ArrayBuffer } | { ok: false; error: string }> {
  // A media_id is scoped to the WABA/app that owns it. Studios with their own
  // token (e.g. Canggu) upload + receive media on their OWN WABA, so we MUST
  // resolve the id with that same studio config — using the global token here
  // returns a permissions error and the image silently fails to load. Callers
  // pass the per-studio config; we only fall back to global when none given.
  const cfg = config ?? getConfig()
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
  config?: CloudConfig | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = config ?? getConfig()
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
export async function sendWhatsAppText(toPhone: string, text: string, config?: CloudConfig | null): Promise<SendResult> {
  const cfg = config ?? getConfig()
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
 * React to a message with an emoji (WhatsApp message reaction). Pass an empty
 * string as `emoji` to remove a previously sent reaction. `messageWamId` is the
 * Meta wamid of the message being reacted to. Like free-form text, this only
 * works inside the 24h customer-service window.
 */
export async function sendWhatsAppReaction(
  toPhone: string,
  messageWamId: string,
  emoji: string,
  config?: CloudConfig | null,
): Promise<SendResult> {
  const cfg = config ?? getConfig()
  if (!cfg) return { ok: false, error: "not_configured" }
  const to = normalizePhone(toPhone)
  if (!to) return { ok: false, error: "empty_phone" }
  if (!messageWamId) return { ok: false, error: "no_message_id" }
  return postMessage(cfg, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "reaction",
    reaction: { message_id: messageWamId, emoji },
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
  /** Values for {{n}} placeholders in the template's HEADER text (Meta allows
   *  one). Separate namespace from body `variables` — used e.g. to inject the
   *  studio city into a "Gravity Stretching {{1}}" header. */
  headerVariables?: string[]
  /** Payload to attach to the template's first quick-reply button. Meta
   *  delivers this string back to us in `msg.button.payload` when the user
   *  taps the button, letting us tie the tap to an exact record (e.g. a
   *  specific booking) instead of guessing from text. */
  buttonPayload?: string
  config?: CloudConfig | null
}): Promise<SendResult> {
  const cfg = opts.config ?? getConfig()
  if (!cfg) {
    console.warn("[whatsapp-cloud] missing WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN — skip")
    return { ok: false, error: "not_configured" }
  }
  const to = normalizePhone(opts.toPhone)
  if (!to) return { ok: false, error: "empty_phone" }

  const components: Array<Record<string, unknown>> = []
  if (opts.headerVariables?.length) {
    components.push({
      type: "header",
      parameters: opts.headerVariables.map((v) => ({ type: "text", text: v })),
    })
  }
  if (opts.variables?.length) {
    components.push({
      type: "body",
      parameters: opts.variables.map((v) => ({ type: "text", text: v })),
    })
  }
  if (opts.buttonPayload) {
    components.push({
      type: "button",
      sub_type: "quick_reply",
      index: 0,
      parameters: [{ type: "payload", payload: opts.buttonPayload }],
    })
  }

  return postMessage(cfg, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode },
      ...(components.length ? { components } : {}),
    },
  })
}

/**
 * Send a WhatsApp AUTHENTICATION template carrying a one-time code. These
 * templates render the code prominently in the notification + offer a one-tap
 * "Copy code" button — the closest WhatsApp gets to OTP autofill. Both the body
 * and the copy-code button take the same code as their parameter.
 */
export async function sendWhatsAppAuthCode(opts: {
  toPhone: string
  templateName: string
  languageCode: string
  code: string
  config?: CloudConfig | null
}): Promise<SendResult> {
  const cfg = opts.config ?? getConfig()
  if (!cfg) return { ok: false, error: "not_configured" }
  const to = normalizePhone(opts.toPhone)
  if (!to) return { ok: false, error: "empty_phone" }
  return postMessage(cfg, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode },
      components: [
        { type: "body", parameters: [{ type: "text", text: opts.code }] },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [{ type: "text", text: opts.code }],
        },
      ],
    },
  })
}

// --- High-level helpers wired to your booking domain --------------------------
//
// The business-template senders (booking confirmation, class reminders,
// trainer pings, owner forwards) moved to lib/whatsapp-messages.ts in the
// 2026-06-12 split — this file keeps only the Cloud API primitives. The
// re-export below keeps every existing import path working.

export {
  sendClientBookingConfirmationWA,
  sendClassReminderWA,
  sendClassTodayConfirmWA,
  forwardClientReplyToTrainer,
  sendTrainerBookingNotificationWA,
  forwardInboundToOwner,
} from "./whatsapp-messages"
