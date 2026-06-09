// WhatsApp self-service cancellation bot.
//
// Flow (all driven by the inbound webhook, so we're always inside the 24h
// customer-service window and can reply with free-form text):
//   1. Client texts their 3-digit ticket code → we find their upcoming booking
//      and ask "Cancel your booking on <date> at <time>? Reply 1=yes / 0=no".
//   2. Client replies "1" → we cancel (if still within the cancellation window)
//      and confirm. "0" → we keep it.
//
// Ticket codes are only unique per slot (3 digits), so matching is scoped to
// the texting phone number — a client effectively never has two upcoming
// bookings sharing a code.
import { prisma } from "@/lib/prisma"
import { sendWhatsAppText, getConfigFor } from "@/lib/whatsapp-cloud"
import { appendOutboundMessage } from "@/lib/whatsapp-conversation"
import { restoreMembershipClass, phoneTail } from "@/lib/membership"
import { slotStartMs } from "@/lib/booking-cutoff"

// A pending "1/0" confirmation is only honoured for 15 minutes.
const PENDING_TTL_MS = 15 * 60 * 1000
// Cancellation is allowed when EITHER condition holds:
const CANCEL_LEAD_MS = 2 * 60 * 60 * 1000 // class is >= 2h away, OR
const GRACE_AFTER_BOOKING_MS = 30 * 60 * 1000 // booking was made <= 30 min ago.

/**
 * The cancellation policy. Allowed if the class is at least 2h away (matches
 * the booking cutoff and what clients are told), OR the booking was created
 * within the last 30 minutes (grace window for someone who just booked a
 * soon-to-start class and immediately changed their mind).
 */
export function canCancelBooking(
  slotDate: string,
  slotStartTime: string,
  createdAt: Date | string,
  nowMs = Date.now()
): boolean {
  const start = slotStartMs(slotDate, slotStartTime)
  if (start - nowMs >= CANCEL_LEAD_MS) return true
  if (nowMs - new Date(createdAt).getTime() <= GRACE_AFTER_BOOKING_MS) return true
  return false
}

/**
 * Handle one inbound text for the cancel bot. Safe to call on every inbound
 * message: it only acts on a 3-digit ticket code or a pending "1"/"0" reply,
 * and otherwise no-ops so normal inbox handling proceeds.
 *
 * `clientPhone` is the digits-only number Meta gives us (msg.from).
 */
export async function handleCancelBotMessage(opts: {
  studioId: string
  conversationId: string
  clientPhone: string
  text: string | null
}): Promise<void> {
  const text = (opts.text ?? "").trim()
  if (!text) return

  // This studio's own WhatsApp config (per-studio number; falls back to global).
  const studioWA = await prisma.studio.findUnique({
    where: { id: opts.studioId },
    select: { whatsappPhoneNumberId: true, whatsappAccessToken: true },
  })
  const waConfig = getConfigFor(studioWA)

  const reply = async (msg: string) => {
    const r = await sendWhatsAppText(opts.clientPhone, msg, waConfig)
    await appendOutboundMessage({
      conversationId: opts.conversationId,
      type: "text",
      body: msg,
      waMessageId: r.ok ? r.messageId : null,
      status: r.ok ? "sent" : "failed",
      errorDetail: r.ok ? null : r.error,
    })
  }

  const convo = await prisma.whatsAppConversation.findUnique({
    where: { id: opts.conversationId },
    select: { pendingCancelBookingId: true, pendingCancelAt: true },
  })

  const pendingFresh =
    !!convo?.pendingCancelBookingId &&
    !!convo.pendingCancelAt &&
    Date.now() - new Date(convo.pendingCancelAt).getTime() <= PENDING_TTL_MS

  // --- Step 2: answering a pending confirmation ---
  if (pendingFresh && (text === "1" || text === "0")) {
    await prisma.whatsAppConversation.update({
      where: { id: opts.conversationId },
      data: { pendingCancelBookingId: null, pendingCancelAt: null },
    })

    if (text === "0") {
      await reply("No problem — your booking is kept. 🙏")
      return
    }

    const booking = await prisma.booking.findUnique({
      where: { id: convo!.pendingCancelBookingId! },
      include: { slot: true },
    })
    if (!booking || booking.status !== "CONFIRMED") {
      await reply("That booking is no longer active.")
      return
    }
    if (!canCancelBooking(booking.slot.date, booking.slot.startTime, booking.createdAt)) {
      await reply(
        "Sorry, cancellation is no longer available — it's less than 2 hours before the class. Please contact the studio."
      )
      return
    }
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED" },
      select: { id: true, status: true, slot: { select: { date: true, startTime: true } } },
    })
    // Give the class back to the membership if it was paid from one.
    if (booking.membershipId) await restoreMembershipClass(booking.membershipId)
    console.log("[cancel-bot] cancelled", {
      bookingId: updated.id,
      newStatus: updated.status,
      slot: `${updated.slot.date} ${updated.slot.startTime}`,
      phone: opts.clientPhone,
    })
    await reply("Booking canceled 😔\n\nHope to see you another time 💫")
    return
  }

  // --- Quick-reply button with our payload "CANCEL:<code>" ---
  // The confirmation template's "Cancel booking" button delivers this payload.
  // It identifies the EXACT booking, so we cancel it in one shot — no "type
  // your code" follow-up. If the booking is already cancelled (e.g. the
  // client tapped twice), we re-send the same success reply so the message
  // is never confusing.
  const payloadCode = text.match(/^CANCEL:(\d{3})$/i)?.[1] ?? null
  if (payloadCode) {
    const tail = phoneTail(opts.clientPhone)
    if (tail.length < 6) return
    // Phones in the DB are stored as the client typed them ("+62 821-4554-…"),
    // so we filter by last-10-digits in JS — same heuristic the membership
    // lookup uses.
    const candidates = await prisma.booking.findMany({
      where: { ticketCode: payloadCode, slot: { studioId: opts.studioId } },
      include: { slot: true },
      orderBy: { createdAt: "desc" },
    })
    const ownByPhone = candidates.filter((b) => phoneTail(b.clientPhone) === tail)
    // Active first; if none active but the booking exists & belongs to this
    // phone (already cancelled), treat as success.
    const active = ownByPhone.find((b) => b.status === "CONFIRMED")
    if (active) {
      if (!canCancelBooking(active.slot.date, active.slot.startTime, active.createdAt)) {
        await reply(
          "Sorry, cancellation is no longer available — it's less than 2 hours before the class. Please contact the studio."
        )
        return
      }
      const updated = await prisma.booking.update({
        where: { id: active.id },
        data: { status: "CANCELLED" },
        select: { id: true, status: true, slot: { select: { date: true, startTime: true } } },
      })
      if (active.membershipId) await restoreMembershipClass(active.membershipId)
      console.log("[cancel-bot] cancelled via payload", {
        bookingId: updated.id,
        ticket: payloadCode,
        slot: `${updated.slot.date} ${updated.slot.startTime}`,
        phone: opts.clientPhone,
      })
      await reply("Booking canceled 😔\n\nHope to see you another time 💫")
      return
    }
    // Booking exists under this phone but is already cancelled → duplicate the
    // same success reply (per owner: "просто продублируй сообщение что ваша
    // бронь отменена").
    if (ownByPhone.length > 0) {
      await reply("Booking canceled 😔\n\nHope to see you another time 💫")
      return
    }
    // Payload doesn't match any booking on this phone — bail silently so the
    // text isn't treated as a real cancel attempt (it shouldn't happen with
    // our own templates).
    return
  }

  // --- Step 1: a 3-digit ticket code (legacy text path: client texts "482") ---
  const code = /^\d{3}$/.test(text)
    ? text
    : (text.match(/cancel\D*(\d{3})\b/i)?.[1] ?? null)
  if (code) {
    const tail = phoneTail(opts.clientPhone)
    if (tail.length < 6) return
    // Bookings store phones AS THE CLIENT TYPED THEM (with spaces / dashes),
    // so we can't SQL-match a contiguous digit substring against the formatted
    // string — `{ contains: '546405' }` misses "+62 821-4554-6405". Pull this
    // ticket-code's CONFIRMED candidates and compare by last-10-digits in JS.
    const all = await prisma.booking.findMany({
      where: { ticketCode: code, status: "CONFIRMED", slot: { studioId: opts.studioId } },
      include: { slot: true },
    })
    const candidates = all.filter((b) => phoneTail(b.clientPhone) === tail)
    const now = Date.now()
    const upcoming = candidates
      .filter((b) => slotStartMs(b.slot.date, b.slot.startTime) > now)
      .sort((a, b) => slotStartMs(a.slot.date, a.slot.startTime) - slotStartMs(b.slot.date, b.slot.startTime))

    if (upcoming.length === 0) return // not their ticket — let normal inbox handle it

    const booking = upcoming[0]
    await prisma.whatsAppConversation.update({
      where: { id: opts.conversationId },
      data: { pendingCancelBookingId: booking.id, pendingCancelAt: new Date() },
    })
    await reply(
      `Do you want to cancel your booking on ${booking.slot.date} at ${booking.slot.startTime}? Reply 1 for yes, 0 to keep it.`
    )
    return
  }

  // --- Step 1b: the "Cancel booking" quick-reply button (no code) ---
  // The booking confirmation's quick-reply button sends this text. With no
  // ticket code to go on, we target the client's NEAREST upcoming booking in
  // this studio and ask them to confirm.
  if (/^cancel booking$/i.test(text) || /отмен/i.test(text)) {
    const tail = phoneTail(opts.clientPhone)
    if (tail.length < 6) return
    // See the ticket-code branch above — same reason we filter in JS, not SQL.
    const all = await prisma.booking.findMany({
      where: { status: "CONFIRMED", slot: { studioId: opts.studioId } },
      include: { slot: true },
    })
    const candidates = all.filter((b) => phoneTail(b.clientPhone) === tail)
    const now = Date.now()
    const upcoming = candidates
      .filter((b) => slotStartMs(b.slot.date, b.slot.startTime) > now)
      .sort((a, b) => slotStartMs(a.slot.date, a.slot.startTime) - slotStartMs(b.slot.date, b.slot.startTime))

    if (upcoming.length === 0) {
      // Honest reply: there's nothing active to cancel under this number. The
      // previous "Booking canceled 😔" here was a hard bug — it told clients
      // their booking was gone while the booking was still CONFIRMED on the
      // class, so the trainer kept seeing the client.
      await reply(
        "We couldn't find an active booking on this number. If you already cancelled, you're good — otherwise please reply with your 3-digit ticket code."
      )
      return
    }

    const booking = upcoming[0]
    await prisma.whatsAppConversation.update({
      where: { id: opts.conversationId },
      data: { pendingCancelBookingId: booking.id, pendingCancelAt: new Date() },
    })
    await reply(
      `Do you want to cancel your booking on ${booking.slot.date} at ${booking.slot.startTime}? Reply 1 for yes, 0 to keep it.`
    )
    return
  }
}
