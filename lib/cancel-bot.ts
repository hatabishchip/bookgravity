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
import { sendWhatsAppText } from "@/lib/whatsapp-cloud"
import { appendOutboundMessage } from "@/lib/whatsapp-conversation"
import { restoreMembershipClass, phoneTail } from "@/lib/membership"
import { slotStartMs } from "@/lib/booking-cutoff"

// A pending "1/0" confirmation is only honoured for 15 minutes.
const PENDING_TTL_MS = 15 * 60 * 1000
// Cancellation is allowed when EITHER condition holds:
const CANCEL_LEAD_MS = 4 * 60 * 60 * 1000 // class is >= 4h away, OR
const GRACE_AFTER_BOOKING_MS = 30 * 60 * 1000 // booking was made <= 30 min ago.

/**
 * The cancellation policy. Allowed if the class is at least 4h away, OR the
 * booking was created within the last 30 minutes (grace window for someone who
 * just booked a soon-to-start class and immediately changed their mind).
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

  const reply = async (msg: string) => {
    const r = await sendWhatsAppText(opts.clientPhone, msg)
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
        "Sorry, cancellation is no longer available — it's less than 4 hours before the class. Please contact the studio."
      )
      return
    }
    await prisma.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } })
    // Give the class back to the membership if it was paid from one.
    if (booking.membershipId) await restoreMembershipClass(booking.membershipId)
    await reply("Your booking has been cancelled. ✅")
    return
  }

  // --- Step 1: a 3-digit ticket code ---
  if (/^\d{3}$/.test(text)) {
    const tail = phoneTail(opts.clientPhone)
    if (tail.length < 6) return
    const candidates = await prisma.booking.findMany({
      where: {
        ticketCode: text,
        status: "CONFIRMED",
        clientPhone: { contains: tail },
        slot: { studioId: opts.studioId },
      },
      include: { slot: true },
    })
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
}
