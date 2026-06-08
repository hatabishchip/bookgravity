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
  config?: CloudConfig | null
}): Promise<SendResult> {
  const cfg = opts.config ?? getConfig()
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

/**
 * Send booking confirmation to client. Uses a template because the client
 * has (almost certainly) never written to the business number first.
 *
 * Template name + language are read from env so you can edit the template
 * in Meta without redeploying. Defaults match the names suggested in setup:
 *   WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION (default: booking_confirmation)
 *   WHATSAPP_TEMPLATE_LANG               (default: en)
 *
 * Template body (v2 — 4 vars):
 *   Hi {{1}}, your booking is confirmed.
 *   Date: {{2}}  Time: {{3}}  Ticket: {{4}}
 * Template body (v3 — 5 vars): adds a "📍 Location: {{5}}" line carrying the
 * studio's Google Maps link from settings. We only pass the 5th variable when
 * the active template name is the v3 one, so switching templates via env is
 * the single source of truth (no var-count mismatch during rollout).
 */
export async function sendClientBookingConfirmationWA(opts: {
  clientPhone: string
  clientName: string
  date: string
  time: string
  ticketCode: string
  /** Studio's Google Maps link (Studio.locationUrl). Used by the v3 template. */
  locationUrl?: string | null
  /** Studio's WhatsApp number (digits) for the v4 one-tap cancel link. */
  cancelWaNumber?: string | null
  /** Pretty start time ("7:00 am") used by the v5 layout's "Class at {{2}}". */
  startTimePretty?: string | null
  /** The booked studio's own WhatsApp config (per-studio number). */
  studioWA?: StudioWA
}): Promise<SendResult> {
  // Default to the approved v7 (new layout + quick-reply "Cancel booking"
  // button). Override via env. (Vercel's `env add` tends to store an empty
  // value, so the code default is the reliable switch.)
  const templateName =
    process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION || "booking_confirmed_v7"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"

  // Modern layout (v5 and up): {{1}} pretty date, {{2}} start time ("7:00 AM"),
  // {{3}} ticket, {{4}} location. v6 is the one exception — it adds {{5}} = a
  // one-tap wa.me cancel link (v7+ use a native quick-reply button instead, no
  // extra var). Parsing the trailing version number keeps this future-proof.
  const verMatch = templateName.match(/v(\d+)$/)
  const ver = verMatch ? Number(verMatch[1]) : 0
  const isV6 = ver === 6
  if (ver >= 5) {
    const vars = [
      opts.date,
      (opts.startTimePretty || opts.time) ?? "—",
      opts.ticketCode,
      opts.locationUrl?.trim() || "—",
    ]
    if (isV6) {
      const num = (opts.cancelWaNumber || "").replace(/\D/g, "")
      vars.push(
        num
          ? `https://wa.me/${num}?text=${encodeURIComponent(`Cancel ${opts.ticketCode}`)}`
          : "—",
      )
    }
    return sendWhatsAppTemplate({
      toPhone: opts.clientPhone,
      templateName,
      languageCode: lang,
      variables: vars,
      config: getConfigFor(opts.studioWA),
    })
  }

  const variables = [opts.clientName, opts.date, opts.time, opts.ticketCode]
  // v3 and v4 carry an extra {{5}} location variable. Fall back to a dash if
  // the studio has no location set (Meta rejects empty body parameters).
  const isV4 = /v4$/.test(templateName)
  if (/v3$/.test(templateName) || isV4) {
    variables.push(opts.locationUrl?.trim() || "—")
  }
  // v4 adds {{6}}: a one-tap wa.me cancel link prefilled with "Cancel <code>".
  if (isV4) {
    const num = (opts.cancelWaNumber || "").replace(/\D/g, "")
    const cancelUrl = num
      ? `https://wa.me/${num}?text=${encodeURIComponent(`Cancel ${opts.ticketCode}`)}`
      : "—"
    variables.push(cancelUrl)
  }
  return sendWhatsAppTemplate({
    toPhone: opts.clientPhone,
    templateName,
    languageCode: lang,
    variables,
    config: getConfigFor(opts.studioWA),
  })
}

/**
 * Day-before class reminder, sent by the daily cron at 17:00 studio-local time.
 * The trainer's name is deliberately NOT shown to the client (owner's choice);
 * the message is from the studio. Single variable:
 *   {{1}} = class time (e.g. "09:00–11:00")
 * `trainerName` is still accepted (callers pass it for the admin-side chat log)
 * but isn't sent in the client message.
 */
export async function sendClassReminderWA(opts: {
  clientPhone: string
  trainerName: string
  time: string
  /** The class's studio's own WhatsApp config (per-studio number). */
  studioWA?: StudioWA
}): Promise<SendResult> {
  const templateName = process.env.WHATSAPP_TEMPLATE_CLASS_REMINDER || "class_reminder_v2"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
  return sendWhatsAppTemplate({
    toPhone: opts.clientPhone,
    templateName,
    languageCode: lang,
    variables: [opts.time],
    config: getConfigFor(opts.studioWA),
  })
}

/**
 * Same-day "are you still coming to today's class?" check-in, sent ~2.5h
 * before the class by the frequent today-reminder cron. Uses the approved,
 * variable-free `class_today_confirm` template (no good-morning/afternoon so
 * it reads naturally at any hour). The client's reply is later forwarded to
 * the trainer — see forwardClientReplyToTrainer + the webhook.
 */
export async function sendClassTodayConfirmWA(opts: {
  clientPhone: string
  /** The class's studio's own WhatsApp config (per-studio number). */
  studioWA?: StudioWA
}): Promise<SendResult> {
  const templateName =
    process.env.WHATSAPP_TEMPLATE_TODAY_CONFIRM || "class_today_confirm"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
  return sendWhatsAppTemplate({
    toPhone: opts.clientPhone,
    templateName,
    languageCode: lang,
    // class_today_confirm has no variables.
    config: getConfigFor(opts.studioWA),
  })
}

/**
 * Forward a client's reply (to the same-day reminder) to the class trainer's
 * personal WhatsApp, so the trainer knows who's still coming. Trainers don't
 * write to the business number, so they have no open 24h window — we MUST use
 * an approved template (free text would be silently dropped). Template:
 *   {{1}} = client name
 *   {{2}} = the client's reply (or a short "[photo]" label for media)
 * Name from WHATSAPP_TEMPLATE_CLIENT_REPLY (default "client_reply_to_trainer").
 */
export async function forwardClientReplyToTrainer(opts: {
  trainerPhone: string
  clientName: string
  /** Inbound message type (text/image/audio/...). */
  type: string
  /** Text body OR media caption (whichever applies). */
  body: string | null
  /** Filename for documents (optional). */
  filename?: string | null
  /** The class's studio's own WhatsApp config (per-studio number). */
  config?: CloudConfig | null
}): Promise<SendResult> {
  const cfg = opts.config ?? getConfig()
  if (!cfg) return { ok: false, error: "not_configured" }
  const templateName =
    process.env.WHATSAPP_TEMPLATE_CLIENT_REPLY || "client_reply_to_trainer"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"

  // Media types have no text → substitute a short label (Meta rejects empty
  // variables). Captions append after the label so context isn't lost.
  const typeLabel = (() => {
    switch (opts.type) {
      case "text":
        return null
      case "image":
        return "📷 [photo]"
      case "video":
        return "🎬 [video]"
      case "audio":
        return "🎤 [voice message]"
      case "sticker":
        return "💬 [sticker]"
      case "document":
        return `📄 [document${opts.filename ? `: ${opts.filename}` : ""}]`
      default:
        return `📨 [${opts.type}]`
    }
  })()
  const replyText =
    typeLabel === null
      ? opts.body && opts.body.trim().length > 0
        ? opts.body
        : "(empty)"
      : opts.body && opts.body.trim().length > 0
        ? `${typeLabel}\n${opts.body}`
        : typeLabel

  const MAX_VAR = 1000
  const safe = (s: string) => (s.length > MAX_VAR ? s.slice(0, MAX_VAR - 1) + "…" : s)

  return sendWhatsAppTemplate({
    toPhone: opts.trainerPhone,
    templateName,
    languageCode: lang,
    variables: [safe(opts.clientName || "A client"), safe(replyText)],
    config: cfg,
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
  /** The booked studio's own WhatsApp config (per-studio number). */
  studioWA?: StudioWA
}): Promise<SendResult> {
  const cfg = getConfigFor(opts.studioWA)
  const namesLine = opts.clientNames.join(", ")

  // ALWAYS send via the approved UTILITY template. Trainers don't message the
  // business number, so they have no open 24h window — free text would be
  // rejected (or, worse, accepted with a 200 and then silently dropped, which
  // made the notification never arrive). A template delivers regardless of the
  // window, so this is the reliable path.
  const templateName =
    process.env.WHATSAPP_TEMPLATE_TRAINER_NOTIFICATION || "trainer_new_booking"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
  // Only the legacy `trainer_new_booking` template has 5 params (separate
  // booked + capacity). The modern templates — `trainer_booking_v3` (what
  // production uses) and `trainer_class_booking` — have 4, with a combined
  // "booked/max" param. Sending 5 to a 4-param template makes Meta reject the
  // send ("localizable_params (5) does not match expected (4)"), which is why
  // trainers stopped receiving notifications. Long-form date fills {{1}}.
  const legacy5 = templateName === "trainer_new_booking"
  const longDate = formatLongDate(opts.date)
  const variables = legacy5
    ? [
        longDate,
        opts.time,
        String(opts.bookedCount),
        String(opts.maxCapacity),
        namesLine || "—",
      ]
    : [longDate, opts.time, `${opts.bookedCount}/${opts.maxCapacity}`, namesLine || "—"]
  return sendWhatsAppTemplate({
    toPhone: opts.trainerPhone,
    templateName,
    languageCode: lang,
    variables,
    config: cfg,
  })
}

/**
 * Forward an inbound message to the owner's personal WhatsApp number as a
 * copy. Uses an approved utility template so delivery doesn't depend on the
 * 24h customer-service window — the owner doesn't have to write to the
 * business number to keep messages flowing.
 *
 * Behaviour:
 *   • Read template name from WHATSAPP_TEMPLATE_INBOUND_COPY env.
 *   • Send via sendWhatsAppTemplate with two body vars:
 *       {{1}} = sender display ("Anna (+62...)" or just "+62...")
 *       {{2}} = the message body OR a short label like "[photo]" / "[voice]"
 *   • Captions on images/videos are appended to {{2}} so context isn't lost.
 *   • Media bytes themselves aren't attached — templates with media headers
 *     need pre-approved sample media per format, more brittle than worth it
 *     for v1. Owner can open the inbox to see the actual media.
 *
 * Anti-loop: when `from` equals OWNER_NOTIFY_PHONE we skip (without that
 * every owner-→-business text would echo back).
 *
 * Best-effort: returns ok/error but never throws so it can be
 * fire-and-forgotten from the webhook hot path.
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
  /** Filename for documents (optional). */
  filename?: string | null
  /** The studio's own WhatsApp config (per-studio number). */
  config?: CloudConfig | null
}): Promise<SendResult> {
  const ownerPhone = process.env.OWNER_NOTIFY_PHONE
  if (!ownerPhone) {
    return { ok: false, error: "OWNER_NOTIFY_PHONE not set" }
  }
  const templateName = process.env.WHATSAPP_TEMPLATE_INBOUND_COPY
  if (!templateName) {
    return { ok: false, error: "WHATSAPP_TEMPLATE_INBOUND_COPY not set" }
  }
  const cfg = opts.config ?? getConfig()
  if (!cfg) return { ok: false, error: "not_configured" }

  // Anti-loop: drop sends where the inbound `from` is the owner themselves.
  const ownerDigits = normalizePhone(ownerPhone)
  if (normalizePhone(opts.fromPhone) === ownerDigits) {
    return { ok: false, error: "skip_owner_self" }
  }

  // {{1}} — sender label.
  const senderLabel = opts.fromName?.trim()
    ? `${opts.fromName.trim()} (+${opts.fromPhone})`
    : `+${opts.fromPhone}`

  // {{2}} — body. For media types we substitute a short label (Meta rejects
  // empty variables). Captions append after the label so the owner sees both.
  const typeLabel = (() => {
    switch (opts.type) {
      case "text":
        return null
      case "image":
        return "📷 [photo]"
      case "video":
        return "🎬 [video]"
      case "audio":
        return "🎤 [voice]"
      case "sticker":
        return "💬 [sticker]"
      case "document":
        return `📄 [document${opts.filename ? `: ${opts.filename}` : ""}]`
      default:
        return `📨 [${opts.type}]`
    }
  })()

  const bodyVar = (() => {
    if (typeLabel === null) {
      // Text inbound — the body itself.
      return opts.body && opts.body.trim().length > 0 ? opts.body : "(empty)"
    }
    return opts.body && opts.body.trim().length > 0
      ? `${typeLabel}\n${opts.body}`
      : typeLabel
  })()

  // WhatsApp body params have a 1024-char limit per Meta docs. Truncate
  // defensively with an ellipsis so a long message can't get the template
  // rejected mid-send.
  const MAX_VAR = 1000
  const safe = (s: string) => (s.length > MAX_VAR ? s.slice(0, MAX_VAR - 1) + "…" : s)

  return sendWhatsAppTemplate({
    toPhone: ownerPhone,
    templateName,
    languageCode: process.env.WHATSAPP_TEMPLATE_LANG || "en",
    variables: [safe(senderLabel), safe(bodyVar)],
    config: cfg,
  })
}
