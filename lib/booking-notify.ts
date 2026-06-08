import { format, parseISO } from "date-fns"
import { prisma } from "@/lib/prisma"
import {
  sendClientBookingConfirmationWA,
  sendTrainerBookingNotificationWA,
} from "@/lib/whatsapp-cloud"
import {
  upsertConversation,
  appendOutboundMessage,
} from "@/lib/whatsapp-conversation"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"

/**
 * Best-effort WhatsApp side effects for a freshly-created booking. Shared by
 * BOTH booking paths so the behaviour is identical no matter who created the
 * booking:
 *   - the public client self-booking flow (/api/bookings), and
 *   - an admin/trainer adding a client by hand (/api/admin/bookings).
 *
 * It always:
 *   1. upserts a Conversation for (studio, clientPhone) assigned to the slot's
 *      trainer — this is what makes the chat appear in /admin/inbox and
 *      /trainer/inbox the moment someone books, and
 *   2. sends the client a booking-confirmation template and logs it as an
 *      outbound message on that conversation, and
 *   3. alerts the assigned trainer + the studio's booking-alert number.
 *
 * Never throws — every failure is logged and swallowed so it can't break the
 * booking response.
 */
export async function notifyBookingCreated(opts: {
  studioId: string
  slotId: string
  clientName: string
  clientPhone: string
  leadBookingId: string
  ticketCode: string
  /** When true, skip the admin booking-alert copy (the admin just made it). */
  skipAdminAlert?: boolean
}): Promise<void> {
  try {
    if (!(await isStudioWhatsAppEnabled(opts.studioId))) {
      console.log("[booking-notify] WA disabled for this studio — skip")
      return
    }

    const slotForWA = await prisma.timeSlot.findUnique({
      where: { id: opts.slotId },
      include: {
        trainer: { select: { name: true, whatsapp: true, notifyWhatsapp: true } },
        studio: { select: { locationUrl: true, whatsappPhoneNumberId: true, whatsappAccessToken: true, whatsappDisplayPhone: true, bookingAlertWhatsapp: true } },
      },
    })
    if (!slotForWA) return

    const prettyDate = slotForWA.date // YYYY-MM-DD; trainer template formats it
    const prettyTime = `${slotForWA.startTime}–${slotForWA.endTime}`
    // Client-facing formatting: "June 6, Friday" + "7:00 am".
    const niceDate = (() => {
      try { return format(parseISO(slotForWA.date), "MMMM d, EEEE") } catch { return slotForWA.date }
    })()
    const niceStart = (() => {
      const [h, m] = slotForWA.startTime.split(":").map(Number)
      if (Number.isNaN(h)) return slotForWA.startTime
      return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`
    })()

    // 1) Ensure a Conversation exists for this client, assigned to the slot's
    //    trainer. This powers /admin/inbox + /trainer/inbox.
    let conversationId: string | null = null
    try {
      const convo = await upsertConversation({
        studioId: opts.studioId,
        clientPhone: opts.clientPhone,
        clientName: opts.clientName,
        assignedTrainerId: slotForWA.trainerId ?? null,
        forceReassign: true, // latest booking's trainer takes ownership of the chat
      })
      conversationId = convo.id
    } catch (err) {
      console.error("[booking-notify] upsertConversation failed:", err)
    }

    const clientMessageBody =
      `Booking is confirmed.\n\n` +
      `${niceDate}\nClass at ${niceStart}\nTicket: ${opts.ticketCode}\n\n` +
      `Please arrive 10 minutes before the class starts.`

    const clientPromise = sendClientBookingConfirmationWA({
      clientPhone: opts.clientPhone,
      clientName: opts.clientName,
      date: niceDate,
      time: prettyTime,
      startTimePretty: niceStart,
      ticketCode: opts.ticketCode,
      locationUrl: slotForWA.studio?.locationUrl,
      cancelWaNumber: slotForWA.studio?.whatsappDisplayPhone || process.env.WHATSAPP_DISPLAY_PHONE || "628213130468",
      studioWA: slotForWA.studio,
    }).then(async (r) => {
      if (!r.ok) console.warn("[booking-notify] WA client send failed:", r.error)
      else console.log("[booking-notify] WA client sent:", r.messageId)
      if (conversationId) {
        try {
          await appendOutboundMessage({
            conversationId,
            type: "template",
            body: clientMessageBody,
            templateName:
              process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION || "booking_confirmed_v7",
            waMessageId: r.ok ? r.messageId : null,
            status: r.ok ? "sent" : "failed",
            errorDetail: r.ok ? null : r.error,
            fromTrainerId: null, // system-sent, not a specific trainer
          })
        } catch (err) {
          console.error("[booking-notify] appendOutboundMessage (client) failed:", err)
        }
      }
    })

    const trainerWA = slotForWA.trainer?.whatsapp
    const trainerName = slotForWA.trainer?.name
    const adminWA = opts.skipAdminAlert ? null : (slotForWA.studio?.bookingAlertWhatsapp?.trim() || null)
    const trainerPromise = (async () => {
      const recordStatus = async (
        status: "sent" | "failed" | "skipped",
        error?: string | null,
        messageId?: string | null,
      ) => {
        try {
          await prisma.booking.update({
            where: { id: opts.leadBookingId },
            data: {
              waNotifyTrainerStatus: status,
              waNotifyTrainerError: error ?? null,
              waNotifyTrainerMessageId: messageId ?? null,
            },
          })
        } catch (err) {
          console.error("[booking-notify] could not persist trainer-notify status:", err)
        }
      }

      const wantTrainer = !!slotForWA.trainer?.notifyWhatsapp && !!trainerWA && !!trainerName
      const wantAdmin = !!adminWA
      if (!wantTrainer && !wantAdmin) {
        await recordStatus("skipped", "no whatsapp recipients")
        return
      }

      const slotBookings = await prisma.booking.findMany({
        where: { slotId: opts.slotId, status: "CONFIRMED" },
        select: { clientName: true },
        orderBy: { createdAt: "asc" },
      })
      const clientNames = Array.from(
        new Set(
          slotBookings
            .map((b) => (b.clientName ?? "").replace(/\s*\(\d+\/\d+\)\s*$/, "").trim())
            .filter(Boolean),
        ),
      )
      const base = {
        trainerName: trainerName ?? "Trainer",
        date: prettyDate,
        time: prettyTime,
        clientNames,
        bookedCount: slotBookings.length,
        maxCapacity: slotForWA.maxCapacity,
        studioWA: slotForWA.studio,
      }

      if (wantTrainer) {
        const r = await sendTrainerBookingNotificationWA({ ...base, trainerPhone: trainerWA! })
        if (!r.ok) {
          console.warn("[booking-notify] WA trainer send failed:", r.error)
          await recordStatus("failed", r.error)
        } else {
          console.log("[booking-notify] WA trainer sent:", r.messageId)
          await recordStatus("sent", null, r.messageId)
        }
      } else {
        await recordStatus("skipped", "trainer whatsapp off / no number")
      }

      if (wantAdmin) {
        const ra = await sendTrainerBookingNotificationWA({ ...base, trainerPhone: adminWA! })
        if (!ra.ok) console.warn("[booking-notify] WA admin alert failed:", ra.error)
        else console.log("[booking-notify] WA admin alert sent:", ra.messageId)
      }
    })()

    await Promise.all([clientPromise, trainerPromise])
  } catch (err) {
    console.error("[booking-notify] exception:", err)
  }
}
