import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { assertCronAuth } from "@/lib/cron-auth"
import { sendClassReminderWA } from "@/lib/whatsapp-cloud"
import { appendOutboundMessage, upsertConversation } from "@/lib/whatsapp-conversation"
import { phoneTail } from "@/lib/membership"
import { clientClassRange } from "@/lib/class-time"
import { elog, elogError } from "@/lib/elog"
import { baliDateStr, addDaysStr } from "@/lib/tz"

export const dynamic = "force-dynamic"
// Sending several reminders sequentially can exceed the default 10s.
export const maxDuration = 60

// Daily "your class is tomorrow" reminder.
//
// Scheduled by Vercel Cron at 09:00 UTC = 17:00 WITA (Bali, UTC+8) — see
// vercel.json. For every CONFIRMED group booking whose class is TOMORROW
// (studio-local), we send the client an approved WhatsApp template signed by
// the class trainer.
//
// Skip rule (per owner): do NOT remind people who booked on the reminder day
// itself (i.e. one day before the class) — they only just got the booking
// confirmation. Only remind clients who booked on an EARLIER calendar day,
// i.e. two or more days before the class. Implemented as:
//   send only if booking.createdAt (Bali date) < today (Bali date)
//
// reminderSentAt guards against double-sends if the cron runs more than once.


export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req)
  if (denied) return denied

  const now = new Date()
  const todayBali = baliDateStr(now)
  const tomorrowBali = addDaysStr(todayBali, 1)

  // Candidate bookings: confirmed classes of ANY type happening tomorrow, not
  // yet reminded. GROUP uses the "group class" template; KIDS/PRIVATE go
  // through the neutral-wording one (see sendClassReminderWA).
  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      slot: { date: tomorrowBali },
    },
    include: {
      slot: {
        include: {
          trainer: { select: { name: true } },
          studio: { select: { name: true, slug: true, whatsappEnabled: true, remindTomorrow: true, whatsappPhoneNumberId: true, whatsappAccessToken: true } },
        },
      },
    },
  })

  let sent = 0
  let skippedSameDay = 0
  let skippedNoWA = 0
  let failed = 0

  for (const b of bookings) {
    // Autonomous studios: only remind via a studio that has its OWN WhatsApp
    // enabled — no borrowing another studio's number. Also respect the
    // Notifications toggle for this reminder.
    if (!b.slot.studio.whatsappEnabled || b.slot.studio.remindTomorrow === false) {
      skippedNoWA++
      continue
    }
    // Skip clients who booked on (or after) the reminder day — they just got
    // the confirmation. Only remind those who booked an earlier calendar day.
    const createdBali = baliDateStr(b.createdAt)
    if (createdBali >= todayBali) {
      skippedSameDay++
      continue
    }

    const trainerName = b.slot.trainer?.name?.trim() || "the Gravity Stretching team"
    // Client-facing time = 1.5h (real slot is 2h with trainer buffer).
    const time = clientClassRange(b.slot.startTime)

    const res = await sendClassReminderWA({
      clientPhone: b.clientPhone,
      trainerName,
      time,
      classType: b.slot.classType,
      studioSlug: b.slot.studio.slug,
      studioName: b.slot.studio.name,
      studioWA: b.slot.studio,
    })

    if (res.ok) {
      sent++
      await elog("reminders:tomorrow", "sent tomorrow-class reminder", {
        bookingId: b.id,
        phoneTail: phoneTail(b.clientPhone),
        classTime: `${b.slot.date} ${b.slot.startTime}`,
      })
      await prisma.booking.update({
        where: { id: b.id },
        data: { reminderSentAt: new Date() },
      })
      // Best-effort: log the reminder in the client's conversation thread so
      // the trainer/admin can see it in the inbox. Booking phones are stored
      // FORMATTED ("+62 812 …") while conversation phones are Meta's bare
      // digits, so we match on the last-10-digit tail in memory rather than by
      // exact string (which never matched → the reminder was missing in chat).
      try {
        const tail = phoneTail(b.clientPhone)
        const convos = await prisma.whatsAppConversation.findMany({
          where: { studioId: b.slot.studioId },
          select: { id: true, clientPhone: true },
        })
        const match = convos.find((c) => phoneTail(c.clientPhone) === tail)
        // No conversation yet? Create it now (assigning the class trainer) so
        // the reminder is logged as the opening message and any later reply has
        // context — otherwise the reply shows up alone in the inbox.
        const convoId =
          match?.id ??
          (
            await upsertConversation({
              studioId: b.slot.studioId,
              clientPhone: b.clientPhone,
              clientName: b.clientName ?? null,
              assignedTrainerId: b.slot.trainerId ?? null,
            })
          ).id
        await appendOutboundMessage({
          conversationId: convoId,
          type: "template",
          body:
            `Reminder: your group class is tomorrow at ${time}. ` +
            `Please arrive 10 minutes early.`,
          templateName: process.env.WHATSAPP_TEMPLATE_CLASS_REMINDER || "class_reminder_v2",
          waMessageId: res.messageId ?? null,
          status: "sent",
          fromTrainerId: null,
        })
      } catch (err) {
        console.error("[class-reminders] convo log failed:", err)
      }
    } else {
      failed++
      console.warn("[class-reminders] send failed:", b.clientPhone, res.error)
      await elogError("reminders:tomorrow", "send failed", {
        bookingId: b.id,
        phoneTail: phoneTail(b.clientPhone),
        error: res.error,
      })
    }
  }

  const summary = {
    ok: true,
    date: tomorrowBali,
    candidates: bookings.length,
    sent,
    skippedSameDay,
    skippedNoWA,
    failed,
  }
  // Heartbeat row: proves the evening cron ran at all.
  await elog("reminders:tomorrow", "run via cron-endpoint", summary)
  return NextResponse.json(summary)
}
