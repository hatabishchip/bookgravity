// WhatsApp Cloud API (Meta) sender.
//
// Required env:
//   WHATSAPP_PHONE_NUMBER_ID  — numeric ID of the sender number (from WhatsApp Manager)
//   WHATSAPP_ACCESS_TOKEN     — permanent System User token with whatsapp_business_messaging
//   WHATSAPP_API_VERSION      — optional, defaults to v21.0
//
// If WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN are missing, all sends
// no-op and log a warning so the booking flow stays unaffected during setup.

const GRAPH_BASE = "https://graph.facebook.com"

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
  const text = [
    `Hi ${opts.trainerName} 👋`,
    ``,
    `New booking for your class:`,
    `📅 ${opts.date}`,
    `⏰ ${opts.time}`,
    `👥 Booked ${opts.bookedCount}/${opts.maxCapacity}: ${namesLine}`,
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
    return sendWhatsAppTemplate({
      toPhone: opts.trainerPhone,
      templateName,
      languageCode: lang,
      variables: [
        opts.date,
        opts.time,
        String(opts.bookedCount),
        String(opts.maxCapacity),
        namesLine || "—",
      ],
    })
  }
  return textResult
}
