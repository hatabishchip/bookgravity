// Business-level WhatsApp messages for the booking domain — split out of
// the 900-line whatsapp-cloud.ts (arch audit 2026-06-11). This module owns
// WHAT we say (template names, variables, domain wiring); whatsapp-cloud
// owns HOW it reaches Meta (config, HTTP, send primitives).

import {
  formatLongDate,
  getConfig,
  getConfigFor,
  normalizePhone,
  sendWhatsAppTemplate,
  type CloudConfig,
  type StudioWA,
  type SendResult,
} from "./whatsapp-cloud"


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
    process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION || "booking_confirmed_v10"
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
      // Bind the template's quick-reply "Cancel booking" button to THIS exact
      // booking via its ticket code. When the client taps the button, Meta
      // delivers this payload back to us so the cancel bot cancels the right
      // booking immediately — no "type your code" follow-up needed.
      buttonPayload: `CANCEL:${opts.ticketCode}`,
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
  /** GROUP | KIDS | PRIVATE — picks the template wording (see below). */
  classType?: string
  /** The class's studio's own WhatsApp config (per-studio number). */
  studioWA?: StudioWA
}): Promise<SendResult> {
  // The approved v2 body hardcodes "group class", so it's only right for
  // GROUP. KIDS/PRIVATE go through the neutral v3 ("a class") — submitted
  // via scripts/create-class-reminder-v3-template.ts. Until v3 is approved
  // those sends fail (logged); same outcome as before, when KIDS/PRIVATE
  // were filtered out entirely, so there's no regression window.
  const isGroup = (opts.classType ?? "GROUP") === "GROUP"
  const templateName = isGroup
    ? process.env.WHATSAPP_TEMPLATE_CLASS_REMINDER || "class_reminder_v2"
    : process.env.WHATSAPP_TEMPLATE_CLASS_REMINDER_ANY || "class_reminder_v3"
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
  // NOTE (audit 2026-06-11): deliberately NO default — production sets this
  // to "" to keep owner-forwarding OFF. Empty/unset = feature disabled.
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
