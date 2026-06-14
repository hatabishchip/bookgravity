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
 * Tell the people who RUN the class that a booking was cancelled — so the
 * trainer never shows up expecting a client who bailed, and the admin keeps
 * an eye on attrition.
 *
 * Recipients:
 *   • the slot's trainer (when Trainer.notifyWhatsapp + a number is on file)
 *   • the studio's booking-alert number — ONLY for client-initiated cancels
 *     (`cancelledBy: "client"`); when staff cancels they already know.
 *
 * Delivery uses the approved `admin_message` UTILITY template ({{1}} name,
 * {{2}} body), which works outside the 24h window — trainers rarely have an
 * open window with the business number.
 *
 * Best-effort: never throws.
 */
export async function notifyStaffOfCancellation(opts: {
  studioId: string
  slotId: string
  clientName: string
  cancelledBy: "client" | "staff"
}): Promise<void> {
  try {
    if (!(await isStudioWhatsAppEnabled(opts.studioId))) return
    const slot = await prisma.timeSlot.findUnique({
      where: { id: opts.slotId },
      include: {
        trainer: { select: { name: true, whatsapp: true, notifyWhatsapp: true } },
        studio: {
          select: {
            whatsappPhoneNumberId: true,
            whatsappAccessToken: true,
            whatsappDisplayPhone: true,
            bookingAlertWhatsapp: true,
            notifyAdminWhatsapp: true,
          },
        },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
    })
    if (!slot) return
    const cfg = getConfigFor(slot.studio)
    if (!cfg) return

    // Trainer-facing time = the real 2h slot (their working block).
    const body =
      `Booking canceled: ${opts.clientName} - ${slot.date}, ` +
      `${slot.startTime}-${slot.endTime}. ` +
      `Now ${slot._count.bookings}/${slot.maxCapacity} booked.`
    const templateName = process.env.WHATSAPP_TEMPLATE_ADMIN_MESSAGE || "admin_message"

    const sendTo = async (phone: string, name: string) => {
      const r = await sendWhatsAppTemplate({
        toPhone: phone,
        templateName,
        languageCode: "en",
        variables: [name, body],
        config: cfg,
      })
      if (!r.ok) console.warn("[booking-cancel] staff cancel-alert failed:", phone, r.error)
    }

    const trainerWA = slot.trainer?.whatsapp?.trim()
    if (slot.trainer?.notifyWhatsapp && trainerWA) {
      await sendTo(trainerWA, slot.trainer.name?.trim().split(/\s+/)[0] || "there")
    }

    if (opts.cancelledBy === "client" && slot.studio.notifyAdminWhatsapp !== false) {
      const adminWA = slot.studio.bookingAlertWhatsapp?.trim()
      const businessDigits = (slot.studio.whatsappDisplayPhone ?? "").replace(/\D/g, "")
      // Never message the studio's own sender number (Meta drops self-sends).
      if (adminWA && adminWA.replace(/\D/g, "") !== businessDigits) {
        await sendTo(adminWA, "there")
      }
    }
  } catch (err) {
    console.error("[booking-cancel] notifyStaffOfCancellation failed:", err)
  }
}

/**
 * Run after a booking row is marked CANCELLED by staff/admin:
 *  - return the class to the client's membership batch (if it was paid that way)
 *  - send the client the cancellation WhatsApp + log it in the inbox thread
 *  - alert the slot's trainer (admin copy is skipped — staff did the cancel)
 * Best-effort: never throws, so callers can't 500 because a notification failed.
 */
export async function afterStaffCancellation(booking: {
  id: string
  clientName: string
  clientPhone: string
  membershipId: string | null
  slotId?: string
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

  // The trainer must hear about it too (roster changed). Staff initiated the
  // cancel, so the admin copy is skipped inside the helper.
  if (booking.slotId) {
    await notifyStaffOfCancellation({
      studioId: booking.slot.studioId,
      slotId: booking.slotId,
      clientName: booking.clientName,
      cancelledBy: "staff",
    })
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
