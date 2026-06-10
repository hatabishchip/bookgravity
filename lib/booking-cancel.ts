// Shared side-effects for cancelling a booking OUTSIDE the WhatsApp cancel
// bot (admin cancel button, slot deletion). The bot has its own copy of this
// logic inline (lib/cancel-bot.ts) because it also manages the conversation
// state machine; everything else should call these helpers so a cancellation
// always restores the membership class and tells the client.
import { prisma } from "@/lib/prisma"
import { restoreMembershipClass } from "@/lib/membership"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { getConfigFor, sendWhatsAppTemplate } from "@/lib/whatsapp-cloud"
import { upsertConversation, appendOutboundMessage } from "@/lib/whatsapp-conversation"

// Mirrors the approved no-variable UTILITY template `booking_canceled`
// (see scripts/create-booking-canceled-template.ts). Template messages work
// outside the 24h customer-service window, so the client is reachable even
// if they never texted us.
const CANCELLED_TEMPLATE = "booking_canceled"
const CANCELLED_TEXT =
  "Done 😊 Your booking has been canceled. " +
  "We'd love to welcome you back on any day that's convenient for you!"

/**
 * Run after a booking row is marked CANCELLED by staff/admin:
 *  - return the class to the client's membership batch (if it was paid that way)
 *  - send the client the cancellation WhatsApp + log it in the inbox thread
 * Best-effort: never throws, so callers can't 500 because a notification failed.
 */
export async function afterStaffCancellation(booking: {
  id: string
  clientName: string
  clientPhone: string
  membershipId: string | null
  slot: { studioId: string }
}): Promise<void> {
  try {
    if (booking.membershipId) await restoreMembershipClass(booking.membershipId)
  } catch (err) {
    console.error("[booking-cancel] membership restore failed:", err)
  }

  try {
    const studioId = booking.slot.studioId
    if (!(await isStudioWhatsAppEnabled(studioId))) return
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { whatsappPhoneNumberId: true, whatsappAccessToken: true },
    })
    const cfg = getConfigFor(studio ?? { whatsappPhoneNumberId: null, whatsappAccessToken: null })
    if (!cfg) return

    const r = await sendWhatsAppTemplate({
      toPhone: booking.clientPhone,
      templateName: CANCELLED_TEMPLATE,
      languageCode: "en",
      config: cfg,
    })
    if (!r.ok) {
      console.warn("[booking-cancel] WA cancel notice failed:", r.error)
      return
    }
    // Mirror the message into the inbox thread so the team sees what was sent.
    const convo = await upsertConversation({
      studioId,
      clientPhone: booking.clientPhone,
      clientName: booking.clientName,
    })
    await appendOutboundMessage({
      conversationId: convo.id,
      type: "template",
      body: CANCELLED_TEXT,
    })
  } catch (err) {
    console.error("[booking-cancel] notify failed:", err)
  }
}

/**
 * Restore membership classes for a batch of bookings that are about to be
 * hard-deleted together with their slot (admin deletes a class). Without this
 * a membership-paid client silently loses the class forever.
 */
export async function restoreMembershipsForBookings(
  bookings: { membershipId: string | null }[],
): Promise<void> {
  for (const b of bookings) {
    if (!b.membershipId) continue
    try {
      await restoreMembershipClass(b.membershipId)
    } catch (err) {
      console.error("[booking-cancel] bulk membership restore failed:", err)
    }
  }
}
