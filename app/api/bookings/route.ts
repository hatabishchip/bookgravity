import { NextRequest, NextResponse, after } from "next/server"
import { format, parseISO } from "date-fns"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { isSlotBookableWithAttendees } from "@/lib/booking-cutoff"
import { generateUniqueTicketCodes } from "@/lib/tickets"
import { sendTrainerBookingNotification, sendClientBookingConfirmation } from "@/lib/mailer"
import { sendPush } from "@/lib/expo-push"
import {
  sendClientBookingConfirmationWA,
  sendTrainerBookingNotificationWA,
} from "@/lib/whatsapp-cloud"
import {
  upsertConversation,
  appendOutboundMessage,
  markBookingPreview,
} from "@/lib/whatsapp-conversation"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { verifyBookingOtp } from "@/lib/otp"
import { isStaffOfStudio } from "@/lib/auth-helpers"
import { hasOtpSession, attachOtpSession } from "@/lib/otp-session"
import { rateLimit, clientIp } from "@/lib/rate-limit"
import { clientClassRange } from "@/lib/class-time"
import { z } from "zod"

const BookingSchema = z.object({
  slotId: z.string(),
  clientName: z.string().min(2),
  // Stored digits-only (canonical since 2026-06-12) — display layers add the +.
  clientPhone: z.string().min(5).transform((p) => p.replace(/\D/g, "")),
  clientEmail: z.string().email(),
  serviceIds: z.array(z.string()).optional(),
  partySize: z.number().int().min(1).max(6).default(1),
  // Set true to proceed past the "you already booked this slot" warning —
  // e.g. when a client knowingly books an extra spot for a friend under their
  // own name/phone.
  confirmDuplicate: z.boolean().optional(),
  // WhatsApp confirmation code the client received (anti-spam). Required when
  // the studio has WhatsApp enabled; ignored otherwise.
  otpCode: z.string().optional(),
})

// Thrown inside the booking transaction when a concurrent request filled the
// last seats between our first capacity check and the atomic re-check. Caught
// at the end of POST and turned into a 409 (same shape as the early check).
class CapacityError extends Error {
  constructor(public seatsLeft: number, public requested: number) {
    super(`Only ${seatsLeft} spot(s) left, you requested ${requested}`)
  }
}

// Generate `count` distinct 3-digit ticket codes for a slot, none colliding
// with existing confirmed bookings. Codes are picked up-front (before the
// create transaction) so codes within one party can't collide with each other
// even though the in-flight rows aren't yet committed/visible to a read.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = BookingSchema.parse(body)

    const studioId = await getPublicStudioId(new URL(request.url).searchParams.get("studio"))

    // Logged-in staff of THIS studio (checked once, reused below): they skip
    // the anonymous per-IP brake (they share the studio wifi's IP with clients
    // and their session IS the anti-abuse credential), skip the OTP code, and
    // never get a client-phone trust cookie minted on their device.
    const isStaff = await isStaffOfStudio(studioId)

    // Abuse brake (audit 2026-06-12): nothing stopped scripted slot-filling.
    if (!isStaff) {
      const rl = await rateLimit({ scope: "book-ip", subject: clientIp(request), limit: 12, windowSec: 3600 })
      if (!rl.ok) {
        return NextResponse.json(
          { error: "Too many booking attempts - please try again later." },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
        )
      }
    }
    const slot = await prisma.timeSlot.findFirst({
      where: { id: data.slotId, studioId, trainerId: { not: null }, publicVisible: true, cancelledAt: null },
      include: {
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
        studio: { select: { timezone: true } },
      },
    })

    if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 })

    // A class with at least one attendee stays open until it ends; an empty one
    // closes 2.5 hours before it starts. Cutoff math uses the studio's own tz
    // (null = Bali) so a non-WITA studio isn't gated ~3h off.
    if (!isSlotBookableWithAttendees(slot.date, slot.startTime, slot.endTime, slot._count.bookings, undefined, slot.studio?.timezone ?? undefined)) {
      return NextResponse.json(
        {
          error:
            slot._count.bookings >= 1
              ? "This class has already finished - bookings are closed."
              : "Bookings close 2.5 hours before the session starts.",
        },
        { status: 409 },
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

    // Anti-spam: when the studio has WhatsApp enabled AND the admin kept the
    // confirmation on, the client must enter the 2-digit code we sent to their
    // WhatsApp before any booking is created. The code isn't consumed on
    // success, so the duplicate-confirm re-POST still passes within the window.
    const otpStudio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: {
        requireBookingOtp: true,
        emailClientBooking: true,
        emailAdminBooking: true,
        notifyAdminWhatsapp: true,
        // Studio's own admin — the booking-info email recipient.
        users: { where: { role: "ADMIN" }, select: { email: true }, orderBy: { id: "asc" }, take: 1 },
      },
    })
    // Per-role notification toggles (all on by default).
    const studioWaOn = await isStudioWhatsAppEnabled(studioId)
    const confirmWhatsapp = otpStudio?.requireBookingOtp !== false
    const emailClient = otpStudio?.emailClientBooking !== false
    const emailAdmin = otpStudio?.emailAdminBooking !== false
    const notifyAdminWa = otpStudio?.notifyAdminWhatsapp !== false
    // The client is confirmed via WhatsApp when the studio's WhatsApp is live
    // AND the WhatsApp channel is on. In that case the client does NOT get an
    // email (they get WhatsApp); the email — if on — goes only to the admin.
    const clientOnWhatsapp = studioWaOn && confirmWhatsapp
    const adminEmail = otpStudio?.users?.[0]?.email ?? null
    // A number verified in the last 2h (signed httpOnly cookie) books without
    // re-entering a WhatsApp code — the session is as strong as the code it
    // was minted from. Logged-in staff of this studio also skip the code:
    // they book on a client's behalf and can't receive the client's code
    // (mirrors the skip in /api/otp/send). Anything else goes through the
    // normal code check.
    const sessionOk = hasOtpSession(request, { phone: data.clientPhone, studioId })
    const staffOk = isStaff
    if (studioWaOn && confirmWhatsapp && !sessionOk && !staffOk) {
      const otp = await verifyBookingOtp({
        studioId,
        phone: data.clientPhone,
        code: data.otpCode ?? "",
      })
      if (!otp.ok) {
        return NextResponse.json(
          {
            error: "Confirmation code is incorrect or expired. Please re-enter the code from WhatsApp.",
            otpError: otp.error,
            otpRemaining: otp.remaining,
          },
          { status: 401 },
        )
      }
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

    // Create N bookings (one per person), all sharing the same lead's name+phone.
    // The whole thing runs in a transaction that RE-CHECKS capacity against a
    // fresh count inside the same atomic unit — without this, two concurrent
    // requests could both pass the earlier check and overbook the class. Ticket
    // codes are pre-generated so they stay distinct within the party.
    const ticketCodes = await generateUniqueTicketCodes(data.slotId, data.partySize)
    type BookingRow = Awaited<ReturnType<typeof prisma.booking.create>>
    const bookings: BookingRow[] = await prisma.$transaction(async (tx) => {
      const fresh = await tx.timeSlot.findUnique({
        where: { id: data.slotId },
        select: {
          maxCapacity: true,
          cancelledAt: true,
          _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
        },
      })
      // Slot vanished OR was cancelled between the availability gate above and
      // this transaction (trainer pressed "can't teach" mid-booking).
      if (!fresh || fresh.cancelledAt) throw new CapacityError(0, data.partySize)
      const freshSeatsLeft = fresh.maxCapacity - fresh._count.bookings
      if (freshSeatsLeft < data.partySize) {
        throw new CapacityError(freshSeatsLeft, data.partySize)
      }
      const rows: BookingRow[] = []
      for (let i = 0; i < data.partySize; i++) {
        const b = await tx.booking.create({
          data: {
            slotId: data.slotId,
            clientName: data.partySize > 1 ? `${data.clientName} (${i + 1}/${data.partySize})` : data.clientName,
            clientEmail: data.clientEmail,
            clientPhone: data.clientPhone,
            ticketCode: ticketCodes[i],
            services: data.serviceIds?.length
              ? { create: data.serviceIds.map((sid) => ({ serviceId: sid })) }
              : undefined,
          },
          include: {
            slot: { include: { trainer: { select: { name: true } } } },
            services: { include: { service: true } },
          },
        })
        rows.push(b)
      }
      return rows
    })

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
        let emailCount = 0
        const confirmData = {
          ...sharedData,
          ticketCode: bookings[0].ticketCode,
          trainerName: trainerName ?? null,
        }
        // Booking Confirmation → Email channel. With WhatsApp covering the
        // client, the client gets WhatsApp (no client email); the email — if on
        // — goes to the admin with the full info. Without WhatsApp, the email
        // goes to the client AND the admin (as before).
        // Client email — only when the client isn't covered by WhatsApp.
        if (emailClient && !clientOnWhatsapp) {
          mailPromises.push(sendClientBookingConfirmation(data.clientEmail, confirmData))
          emailCount += 1
        }
        // Admin email copy.
        if (emailAdmin && adminEmail) {
          mailPromises.push(sendClientBookingConfirmation(adminEmail, confirmData))
          emailCount += 1
        }
        // Respect the trainer's email channel toggle (on by default).
        const trainerWantsEmail = slotWithTrainer.trainer?.notifyEmail !== false
        if (trainerEmail && trainerName && trainerWantsEmail) {
          mailPromises.push(sendTrainerBookingNotification(trainerEmail, trainerName, sharedData))
          emailCount += 1
        } else if (!trainerWantsEmail) {
          console.log("[bookings] trainer email notify OFF for this trainer")
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
              body: `${data.clientName} booked ${sharedData.startTime}-${sharedData.endTime} on ${sharedData.date}`,
              category: "booking",
              data: { slotId: data.slotId, bookingId: bookings[0].id },
            }),
          )
        }
        // Emails + trainer push are staff plumbing - finish them AFTER the
        // response so the client's ticket isn't held hostage (this block used
        // to add 1-3s to every booking). after() keeps the serverless runtime
        // alive until they settle.
        after(() => Promise.allSettled(mailPromises))
      } else {
        console.warn("[bookings] could not load slot for mailing:", data.slotId)
      }
    } catch (err) {
      console.error("[bookings] mailing block exception:", err)
    }

    // null = WA not applicable for this studio; true/false = client confirmation
    // delivery accepted by Meta (surfaced to the widget for honest UX).
    let waClientSent: boolean | null = null

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
        include: {
          trainer: { select: { name: true, whatsapp: true, notifyWhatsapp: true } },
          studio: { select: { locationUrl: true, whatsappPhoneNumberId: true, whatsappAccessToken: true, whatsappDisplayPhone: true, bookingAlertWhatsapp: true } },
        },
      })
      if (slotForWA) {
        const prettyDate = slotForWA.date // YYYY-MM-DD; trainer template formats it
        // Trainer-facing time = real 2h slot (their working block incl. buffer).
        const prettyTime = `${slotForWA.startTime}-${slotForWA.endTime}`
        // Client-facing time = 1.5h (we always tell clients the class is 90min;
        // the extra 30min is the trainer's payment/prep buffer).
        const clientTime = clientClassRange(slotForWA.startTime)
        // Client-facing formatting: "June 9 (Tuesday)" + "7:00 AM".
        const niceDate = (() => {
          try { return format(parseISO(slotForWA.date), "MMMM d (EEEE)") } catch { return slotForWA.date }
        })()
        const niceStart = (() => {
          const [h, m] = slotForWA.startTime.split(":").map(Number)
          if (Number.isNaN(h)) return slotForWA.startTime
          return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
        })()

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
          // Mark booking as unread in the inbox so admin/trainer notice it.
          const preview = `New booking: ${slotForWA.classType || "class"} · ${niceDate} at ${niceStart}`
          await markBookingPreview(convo.id, preview).catch((err) => {
            console.error("[bookings] markBookingPreview failed:", err)
          })
        } catch (err) {
          console.error("[bookings] upsertConversation failed:", err)
        }

        // What we log into the inbox thread. Mirror the party message when 2+
        // people booked, so the admin sees what the client actually received.
        const isParty = data.partySize > 1 && bookings.length > 1
        const ticketLine = isParty
          ? `Tickets: ${bookings.map((b) => `#${b.ticketCode}`).join(", ")}`
          : `Ticket: ${bookings[0].ticketCode}`
        const clientMessageBody =
          (isParty ? `Booking is confirmed for ${data.partySize} people.\n\n` : `Booking is confirmed.\n\n`) +
          `${niceDate}\nClass at ${niceStart}\n${ticketLine}\n\n` +
          `Please arrive 10 minutes before the class starts.`

        // Client WhatsApp confirmation only when the WhatsApp channel is on.
        // (When off, the client gets the email instead — handled above.)
        const clientPromise = !confirmWhatsapp ? Promise.resolve() : sendClientBookingConfirmationWA({
          clientPhone: data.clientPhone,
          clientName: data.clientName,
          date: niceDate,
          time: clientTime,
          startTimePretty: niceStart,
          ticketCode: bookings[0].ticketCode,
          // Party booking → one message naming the count + listing every
          // ticket (booking_confirmed_party). Singles ignore these.
          partySize: data.partySize,
          allTickets: bookings.map((b) => b.ticketCode),
          locationUrl: slotForWA.studio?.locationUrl,
          // wa.me cancel link target: studio's own display number, else the
          // global studio WhatsApp number.
          cancelWaNumber: slotForWA.studio?.whatsappDisplayPhone || process.env.WHATSAPP_DISPLAY_PHONE || "628213130468",
          studioWA: slotForWA.studio,
        }).then(async (r) => {
          waClientSent = r.ok
          if (!r.ok) console.warn("[bookings] WA client send failed:", r.error)
          else console.log("[bookings] WA client sent:", r.messageId)
          if (conversationId) {
            try {
              await appendOutboundMessage({
                conversationId,
                type: "template",
                body: clientMessageBody,
                templateName:
                  process.env.WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION || "booking_confirmed_v10",
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
        // Admin booking-copy recipient: a personal number, NOT the studio's
        // own business number (Meta blocks sending to your own sender). Must
        // be set explicitly in Settings → WhatsApp → "Номер для копий".
        const adminBusinessNumber = (slotForWA.studio?.whatsappDisplayPhone ?? "").replace(/\D/g, "")
        const adminAlertRaw = slotForWA.studio?.bookingAlertWhatsapp?.trim() || null
        const adminWA =
          notifyAdminWa &&
          adminAlertRaw &&
          // Guard: never try to message the studio's own number.
          adminAlertRaw.replace(/\D/g, "") !== adminBusinessNumber
            ? adminAlertRaw
            : null
        const trainerPromise = (async () => {
          // Persist the trainer-notify outcome for the DB audit trail.
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

          // Send the booking alert to the assigned trainer (when their WhatsApp
          // channel is on + a number is set) AND to the studio admin's booking
          // alert number — so both see who booked.
          const wantTrainer = !!slotForWA.trainer?.notifyWhatsapp && !!trainerWA && !!trainerName
          const wantAdmin = !!adminWA
          if (!wantTrainer && !wantAdmin) {
            await recordStatus("skipped", "no whatsapp recipients")
            return
          }

          // Every confirmed booking on this slot → "how full + who's attending"
          // (no phone numbers exposed).
          const slotBookings = await prisma.booking.findMany({
            where: { slotId: data.slotId, status: "CONFIRMED" },
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
              console.warn("[bookings] WA trainer send failed:", r.error)
              await recordStatus("failed", r.error)
            } else {
              console.log("[bookings] WA trainer sent:", r.messageId)
              await recordStatus("sent", null, r.messageId)
            }
          } else {
            await recordStatus("skipped", "trainer whatsapp off / no number")
          }

          // Admin copy — best-effort, not part of the trainer audit field.
          if (wantAdmin) {
            const ra = await sendTrainerBookingNotificationWA({ ...base, trainerPhone: adminWA! })
            if (!ra.ok) console.warn("[bookings] WA admin alert failed:", ra.error)
            else console.log("[bookings] WA admin alert sent:", ra.messageId)
          }
        })()

        // Only the CLIENT confirmation blocks the response (its outcome is
        // shown on the ticket as waConfirmationSent). The trainer/admin alerts
        // finish after the response - the client shouldn't wait for them.
        // after() is registered BEFORE the await: if clientPromise threw, the
        // outer catch would swallow it and an unregistered trainerPromise
        // (with its waNotifyTrainerStatus DB writes) could be frozen by
        // serverless teardown mid-flight.
        after(() => trainerPromise.catch((err) => console.error("[bookings] trainer WA after() failed:", err)))
        await clientPromise
      }
    } catch (err) {
      console.error("[bookings] whatsapp block exception:", err)
    }

    // Return the lead booking (first one)
    // Refresh the 2h verified-phone window on every successful booking — the
    // client just proved the number (code or live session) either way.
    // waConfirmationSent: false → the widget shows a "WhatsApp didn't go
    // through, message us" warning on the ticket instead of silent success.
    const created = NextResponse.json({ ...bookings[0], waConfirmationSent: waClientSent }, { status: 201 })
    // Don't mint OR renew a device-trust cookie on a STAFF member's browser -
    // it would fill their device's trusted-numbers list (max 8) with clients'
    // phones. Guarded by isStaff (not staffOk) so a staff device that happens
    // to hold an old trust entry for a client's phone doesn't keep renewing it.
    if (studioWaOn && confirmWhatsapp && !isStaff) {
      attachOtpSession(request, created, { phone: data.clientPhone, studioId })
    }
    return created
  } catch (err) {
    if (err instanceof CapacityError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
