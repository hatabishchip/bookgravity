import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { isSlotBookable } from "@/lib/booking-cutoff"
import { sendTrainerBookingNotification, sendClientBookingConfirmation } from "@/lib/mailer"
import { sendPush } from "@/lib/expo-push"
import {
  sendClientBookingConfirmationWA,
  sendTrainerBookingNotificationWA,
} from "@/lib/whatsapp-cloud"
import {
  upsertConversation,
  appendOutboundMessage,
} from "@/lib/whatsapp-conversation"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { z } from "zod"

const BookingSchema = z.object({
  slotId: z.string(),
  clientName: z.string().min(2),
  clientPhone: z.string().min(5),
  clientEmail: z.string().email(),
  serviceIds: z.array(z.string()).optional(),
  partySize: z.number().int().min(1).max(6).default(1),
  // Set true to proceed past the "you already booked this slot" warning —
  // e.g. when a client knowingly books an extra spot for a friend under their
  // own name/phone.
  confirmDuplicate: z.boolean().optional(),
})

async function generateUniqueCode(slotId: string): Promise<string> {
  const existing = await prisma.booking.findMany({
    where: { slotId, status: "CONFIRMED" },
    select: { ticketCode: true },
  })
  const used = new Set(existing.map((b) => b.ticketCode))
  let code: string
  do {
    code = String(Math.floor(100 + Math.random() * 900))
  } while (used.has(code))
  return code
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = BookingSchema.parse(body)

    const studioId = await getPublicStudioId(new URL(request.url).searchParams.get("studio"))
    const slot = await prisma.timeSlot.findFirst({
      where: { id: data.slotId, studioId, trainerId: { not: null }, publicVisible: true },
      include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
    })

    if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 })

    if (!isSlotBookable(slot.date, slot.startTime)) {
      return NextResponse.json(
        { error: "Bookings close 2 hours before the session starts" },
        { status: 409 }
      )
    }

    if (data.serviceIds?.length) {
      const services = await prisma.additionalService.findMany({
        where: { id: { in: data.serviceIds }, studioId },
        select: { id: true },
      })
      if (services.length !== data.serviceIds.length) {
        return NextResponse.json({ error: "Invalid service" }, { status: 400 })
      }
    }

    const seatsLeft = slot.maxCapacity - slot._count.bookings
    if (seatsLeft < data.partySize) {
      return NextResponse.json({ error: `Only ${seatsLeft} spot(s) left, you requested ${data.partySize}` }, { status: 409 })
    }

    // Duplicate guard is now a soft warning, not a hard block: a client may
    // legitimately book extra spots for friends under their own name/phone.
    // First attempt returns duplicate:true so the widget can confirm; the
    // re-submit carries confirmDuplicate:true to proceed.
    if (!data.confirmDuplicate) {
      const existing = await prisma.booking.findFirst({
        where: { slotId: data.slotId, clientPhone: data.clientPhone, status: "CONFIRMED" },
        select: { clientName: true },
        orderBy: { createdAt: "asc" },
      })
      if (existing) {
        const existingName = (existing.clientName ?? "").replace(/\s*\(\d+\/\d+\)\s*$/, "").trim()
        return NextResponse.json(
          {
            error: "You already have a booking on this session with this phone number.",
            duplicate: true,
            existingName: existingName || null,
          },
          { status: 409 },
        )
      }
    }

    // Create N bookings (one per person), all sharing the same lead's name+phone
    type BookingRow = Awaited<ReturnType<typeof prisma.booking.create>>
    const bookings: BookingRow[] = []
    for (let i = 0; i < data.partySize; i++) {
      const ticketCode = await generateUniqueCode(data.slotId)
      const b = await prisma.booking.create({
        data: {
          slotId: data.slotId,
          clientName: data.partySize > 1 ? `${data.clientName} (${i + 1}/${data.partySize})` : data.clientName,
          clientEmail: data.clientEmail,
          clientPhone: data.clientPhone,
          ticketCode,
          services: data.serviceIds?.length
            ? { create: data.serviceIds.map((sid) => ({ serviceId: sid })) }
            : undefined,
        },
        include: {
          slot: { include: { trainer: { select: { name: true } } } },
          services: { include: { service: true } },
        },
      })
      bookings.push(b)
    }

    // Send confirmation emails to the client AND notify the assigned trainer.
    // Awaiting both so the serverless function doesn't terminate before the
    // Resend HTTP calls complete (fire-and-forget was unreliable on Vercel).
    // Both mailers swallow their own errors internally so this can't 500.
    try {
      const slotWithTrainer = await prisma.timeSlot.findUnique({
        where: { id: data.slotId },
        include: {
          trainer: {
            include: { user: { select: { email: true } } },
          },
          studio: { select: { name: true, slug: true } },
        },
      })
      if (slotWithTrainer) {
        const sharedData = {
          clientName: data.clientName,
          clientPhone: data.clientPhone,
          clientEmail: data.clientEmail,
          date: slotWithTrainer.date,
          startTime: slotWithTrainer.startTime,
          endTime: slotWithTrainer.endTime,
          classType: slotWithTrainer.classType,
          studioName: slotWithTrainer.studio.name,
          studioSlug: slotWithTrainer.studio.slug,
          partySize: data.partySize,
        }

        const trainerEmail = slotWithTrainer.trainer?.user?.email
        const trainerName = slotWithTrainer.trainer?.name
        const trainerUserId = slotWithTrainer.trainer?.userId
        console.log("[bookings] dispatch mails:", {
          clientEmail: data.clientEmail,
          trainerEmail,
          trainerName,
          slotId: data.slotId,
        })

        const mailPromises: Promise<unknown>[] = []
        mailPromises.push(
          sendClientBookingConfirmation(data.clientEmail, {
            ...sharedData,
            ticketCode: bookings[0].ticketCode,
            trainerName: trainerName ?? null,
          }),
        )
        let emailCount = 1 // client confirmation always sent
        if (trainerEmail && trainerName) {
          mailPromises.push(sendTrainerBookingNotification(trainerEmail, trainerName, sharedData))
          emailCount += 1
        } else {
          console.warn("[bookings] trainer notify SKIPPED — slot has no trainer with an email")
        }
        // Tally emails sent for this studio (super-admin usage view). Push
        // notifications below are NOT email, so they're excluded.
        void prisma.studio.update({
          where: { id: studioId },
          data: { emailsSentCount: { increment: emailCount } },
        }).catch(() => {})
        // Mobile push to the trainer's registered devices. data.category +
        // data.slotId lets the app deep-link to the class screen on tap.
        if (trainerUserId) {
          mailPromises.push(
            sendPush({
              userId: trainerUserId,
              title: "New booking",
              body: `${data.clientName} booked ${sharedData.startTime}–${sharedData.endTime} on ${sharedData.date}`,
              category: "booking",
              data: { slotId: data.slotId, bookingId: bookings[0].id },
            }),
          )
        }
        await Promise.all(mailPromises)
      } else {
        console.warn("[bookings] could not load slot for mailing:", data.slotId)
      }
    } catch (err) {
      console.error("[bookings] mailing block exception:", err)
    }

    // WhatsApp Cloud API notifications. Best-effort, never throws.
    // Skipped entirely for studios where the super-admin hasn't enabled
    // the WhatsApp feature yet (e.g. Ubud while it's still being set up).
    try {
      if (!(await isStudioWhatsAppEnabled(studioId))) {
        console.log("[bookings] WA disabled for this studio — skip notifications")
        return NextResponse.json(bookings[0], { status: 201 })
      }
      const slotForWA = await prisma.timeSlot.findUnique({
        where: { id: data.slotId },
        include: { trainer: { select: { name: true, whatsapp: true } } },
      })
      if (slotForWA) {
        const prettyDate = slotForWA.date // YYYY-MM-DD; template can format
        const prettyTime = `${slotForWA.startTime}–${slotForWA.endTime}`

        // 1) Ensure a Conversation exists for this client and is assigned to
        //    the slot's trainer. This is what powers /admin/inbox + /trainer/inbox.
        let conversationId: string | null = null
        try {
          const convo = await upsertConversation({
            studioId,
            clientPhone: data.clientPhone,
            clientName: data.clientName,
            assignedTrainerId: slotForWA.trainerId ?? null,
            forceReassign: true, // latest booking's trainer takes ownership of the chat
          })
          conversationId = convo.id
        } catch (err) {
          console.error("[bookings] upsertConversation failed:", err)
        }

        const clientMessageBody =
          `Hi ${data.clientName}, your booking is confirmed.\n` +
          `Date: ${prettyDate}\nTime: ${prettyTime}\nTicket: ${bookings[0].ticketCode}\n\n` +
          `Please arrive 10 minutes before the class starts.`

        const clientPromise = sendClientBookingConfirmationWA({
          clientPhone: data.clientPhone,
          clientName: data.clientName,
          date: prettyDate,
          time: prettyTime,
          ticketCode: bookings[0].ticketCode,
        }).then(async (r) => {
          if (!r.ok) console.warn("[bookings] WA client send failed:", r.error)
          else console.log("[bookings] WA client sent:", r.messageId)
          if (conversationId) {
            try {
              await appendOutboundMessage({
                conversationId,
                type: "template",
                body: clientMessageBody,
                templateName:
                  process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION || "booking_confirmed",
                waMessageId: r.ok ? r.messageId : null,
                status: r.ok ? "sent" : "failed",
                errorDetail: r.ok ? null : r.error,
                fromTrainerId: null, // system-sent, not a specific trainer
              })
            } catch (err) {
              console.error("[bookings] appendOutboundMessage (client) failed:", err)
            }
          }
        })

        const trainerWA = slotForWA.trainer?.whatsapp
        const trainerName = slotForWA.trainer?.name
        const trainerPromise = (async () => {
          // Helper to persist outcome on the lead booking so we have a DB
          // audit trail for why the trainer did/didn't get a notification.
          const recordStatus = async (
            status: "sent" | "failed" | "skipped",
            error?: string | null,
            messageId?: string | null,
          ) => {
            try {
              await prisma.booking.update({
                where: { id: bookings[0].id },
                data: {
                  waNotifyTrainerStatus: status,
                  waNotifyTrainerError: error ?? null,
                  waNotifyTrainerMessageId: messageId ?? null,
                },
              })
            } catch (err) {
              console.error("[bookings] could not persist trainer-notify status:", err)
            }
          }

          if (!trainerWA || !trainerName) {
            console.warn("[bookings] WA trainer notify SKIPPED — no whatsapp on trainer")
            await recordStatus("skipped", "no whatsapp on trainer")
            return
          }
          // Look up every confirmed booking on this slot (the new ones we
          // just inserted are included) so the notification tells the
          // trainer how full the class is and who's attending — without
          // exposing any phone numbers.
          const slotBookings = await prisma.booking.findMany({
            where: { slotId: data.slotId, status: "CONFIRMED" },
            select: { clientName: true },
            orderBy: { createdAt: "asc" },
          })
          const clientNames = Array.from(
            // Deduplicate "John (1/2)" / "John (2/2)" multi-seat entries to
            // just "John" so the list is compact.
            new Set(
              slotBookings
                .map((b) => (b.clientName ?? "").replace(/\s*\(\d+\/\d+\)\s*$/, "").trim())
                .filter(Boolean),
            ),
          )
          const r = await sendTrainerBookingNotificationWA({
            trainerPhone: trainerWA,
            trainerName,
            date: prettyDate,
            time: prettyTime,
            clientNames,
            bookedCount: slotBookings.length,
            maxCapacity: slotForWA.maxCapacity,
          })
          if (!r.ok) {
            console.warn("[bookings] WA trainer send failed:", r.error)
            await recordStatus("failed", r.error)
          } else {
            console.log("[bookings] WA trainer sent:", r.messageId)
            await recordStatus("sent", null, r.messageId)
          }
        })()

        await Promise.all([clientPromise, trainerPromise])
      }
    } catch (err) {
      console.error("[bookings] whatsapp block exception:", err)
    }

    // Return the lead booking (first one)
    return NextResponse.json(bookings[0], { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
