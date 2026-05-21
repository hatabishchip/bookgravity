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
    process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION || "booking_confirmation"
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
  return sendWhatsAppTemplate({
    toPhone: opts.clientPhone,
    templateName,
    languageCode: lang,
    variables: [opts.clientName, opts.date, opts.time, opts.ticketCode],
  })
}

/**
 * Notify trainer of a new booking. Tries free-form text first (cheap, works
 * if trainer is in the 24h window). If Meta rejects with a re-engagement
 * error, falls back to a utility template.
 *
 * Expected template body (4 vars):
 *   New booking — {{1}} at {{2}}. Client: {{3}} ({{4}}).
 */
export async function sendTrainerBookingNotificationWA(opts: {
  trainerPhone: string
  trainerName: string
  date: string
  time: string
  clientName: string
  clientPhone: string
  partySize?: number
}): Promise<SendResult> {
  const partyText =
    opts.partySize && opts.partySize > 1 ? ` (+${opts.partySize - 1} more)` : ""
  const text = [
    `Hi ${opts.trainerName} 👋`,
    ``,
    `New booking for your class:`,
    `📅 ${opts.date}`,
    `⏰ ${opts.time}`,
    `👤 ${opts.clientName}${partyText}`,
    `📞 ${opts.clientPhone}`,
  ].join("\n")

  const textResult = await sendWhatsAppText(opts.trainerPhone, text)
  if (textResult.ok) return textResult

  // Re-engagement / 24h window errors → fall back to template.
  // Meta error code 131047 = "Message failed to send because more than 24 hours
  // have passed since the customer last replied."
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
        opts.clientName + partyText,
        opts.clientPhone,
      ],
    })
  }
  return textResult
}
