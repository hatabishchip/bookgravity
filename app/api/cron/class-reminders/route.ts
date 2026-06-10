import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendClassReminderWA } from "@/lib/whatsapp-cloud"
import { appendOutboundMessage, upsertConversation } from "@/lib/whatsapp-conversation"
import { phoneTail } from "@/lib/membership"
import { clientClassRange } from "@/lib/class-time"

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

const BALI_TZ = "Asia/Makassar" // WITA, UTC+8, no DST

function baliDateStr(d: Date): string {
  // en-CA renders as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BALI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function addDaysStr(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron injects "Authorization: Bearer <CRON_SECRET>" when the
  // CRON_SECRET env is set. If it's set we require it; if not, we allow (so the
  // job works before the secret is configured) but Vercel's own cron header is
  // still a soft signal.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const now = new Date()
  const todayBali = baliDateStr(now)
  const tomorrowBali = addDaysStr(todayBali, 1)

  // Candidate bookings: confirmed group classes happening tomorrow, not yet
  // reminded.
  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      slot: { date: tomorrowBali, classType: "GROUP" },
    },
    include: {
      slot: {
        include: {
          trainer: { select: { name: true } },
          studio: { select: { name: true, whatsappEnabled: true, remindTomorrow: true, whatsappPhoneNumberId: true, whatsappAccessToken: true } },
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
      studioWA: b.slot.studio,
    })

    if (res.ok) {
      sent++
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
    }
  }

  return NextResponse.json({
    ok: true,
    date: tomorrowBali,
    candidates: bookings.length,
    sent,
    skippedSameDay,
    skippedNoWA,
    failed,
  })
}
