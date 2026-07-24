import { prisma } from "@/lib/prisma"
import { getConfigFor, sendWhatsAppText } from "@/lib/whatsapp-cloud"
import { appendOutboundMessage } from "@/lib/whatsapp-conversation"
import { translateAndDetect } from "@/lib/translate"

// One-tap attendance confirmation (owner 24.07.2026). The day-before (v7) and
// same-day (v5) reminder templates carry a "Confirm" quick-reply button whose
// payload Meta delivers back as "CONFIRM:<ticketCode>". Tapping it marks the
// booking as confirmed-coming and sends the client a warm acknowledgement.
// The sibling "Cancel booking" button (payload "CANCEL:<code>") is handled by
// the existing cancel bot - untouched here.

// Studio-language acknowledgement; auto-translated to the client's language on
// send (owner-approved wording 24.07). Plain hyphen only, no em dash.
const CONFIRM_ACK = "Got it - thank you for confirming! We'll see you at class 🌿"

/**
 * If `text` is a CONFIRM:<code> button payload, mark the matching booking's
 * attendanceConfirmedAt and reply to the client. Returns true when it handled
 * the message (so the caller can skip the cancel bot / lead-forward for it),
 * false otherwise. Never throws.
 */
export async function handleAttendanceConfirm(opts: {
  studioId: string
  conversationId: string
  clientPhone: string
  clientLanguage?: string | null
  text: string | null
}): Promise<boolean> {
  try {
    const code = (opts.text ?? "").trim().match(/^CONFIRM:(\d{3,})$/i)?.[1]
    if (!code) return false

    // Bind to the client's OWN booking with this ticket, at the studio the
    // button was sent from. A confirm is meaningless once cancelled.
    const tail = opts.clientPhone.slice(-9)
    const booking = await prisma.booking.findFirst({
      where: {
        ticketCode: code,
        status: "CONFIRMED",
        clientPhone: { endsWith: tail },
        slot: { studioId: opts.studioId },
      },
      select: { id: true, slotId: true, attendanceConfirmedAt: true },
      orderBy: { createdAt: "desc" },
    })

    const studioWA = await prisma.studio.findUnique({
      where: { id: opts.studioId },
      select: { whatsappPhoneNumberId: true, whatsappAccessToken: true },
    })
    const waConfig = getConfigFor(studioWA)

    // Already confirmed, or no live booking (cancelled / wrong code): still ack
    // warmly so the tap never feels ignored, but skip a duplicate DB write.
    if (booking && !booking.attendanceConfirmedAt) {
      // A party books N bookings on ONE phone but gets ONE reminder (bound to
      // the lead ticket), so a single Confirm tap must confirm the WHOLE
      // group - same phone, same class - or the trainer roster shows phantom
      // "no reply" guests (mirrors the cancel bot's CANCELALL semantics).
      const stamped = await prisma.booking.updateMany({
        where: {
          slotId: booking.slotId,
          status: "CONFIRMED",
          attendanceConfirmedAt: null,
          clientPhone: { endsWith: tail },
        },
        data: { attendanceConfirmedAt: new Date() },
      })
      if (stamped.count > 1) {
        console.log("[attendance-confirm] party confirm:", stamped.count, "bookings on slot", booking.slotId)
      }
    }

    let out = CONFIRM_ACK
    let translated: string | null = null
    let via: string | null = null
    const lang = opts.clientLanguage ?? null
    if (lang && lang !== "en") {
      try {
        const t = await translateAndDetect({ text: CONFIRM_ACK, targetLang: lang })
        if (t.ok && t.translated && t.sourceLang !== lang) {
          translated = t.translated
          via = t.provider
          out = t.translated
        }
      } catch { /* fall back to English */ }
    }

    const r = await sendWhatsAppText(opts.clientPhone, out, waConfig)
    await appendOutboundMessage({
      conversationId: opts.conversationId,
      type: "text",
      body: CONFIRM_ACK,
      translatedBody: translated,
      detectedLang: lang,
      translatedVia: via,
      waMessageId: r.ok ? r.messageId : null,
      status: r.ok ? "sent" : "failed",
      errorDetail: r.ok ? null : r.error,
    })
    return true
  } catch (err) {
    console.error("[attendance-confirm] failed:", err)
    // Payload was a CONFIRM: - treat as handled so we don't run the cancel bot
    // on a confirm tap even when the ack failed.
    return /^CONFIRM:/i.test((opts.text ?? "").trim())
  }
}
