import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { assertCronAuth } from "@/lib/cron-auth"
import { sendClassTodayConfirmWA } from "@/lib/whatsapp-cloud"
import { appendOutboundMessage, upsertConversation } from "@/lib/whatsapp-conversation"
import { phoneTail } from "@/lib/membership"

export const dynamic = "force-dynamic"
// Sending several reminders sequentially can exceed the default 10s.
export const maxDuration = 60

// Same-day "are you still coming to today's class?" check-in.
//
// Runs frequently (see vercel.json). For every CONFIRMED booking whose class
// starts ~2.5h from now (studio-local, Bali UTC+8), we send the client the
// approved `class_today_confirm` template and arm the conversation so the
// client's FIRST reply is forwarded to the class trainer's WhatsApp (handled
// in the webhook via conversation.pendingReminderTrainerPhone).
//
// todayReminderSentAt guards against double-sends across overlapping cron runs.

const BALI_TZ = "Asia/Makassar" // WITA, UTC+8, no DST

// Send when the class starts within this many minutes from now. 155 gives a
// little slack above 2.5h (150) so a cron tick that lands slightly early still
// catches the class; 20 is the floor so we don't ping when the class is
// basically about to start.
const WINDOW_MAX_MIN = 155
const WINDOW_MIN_MIN = 20
// Skip bookings made in the last 30 min — the client just got the booking
// confirmation, no need to immediately follow up with "still coming?".
const FRESH_SKIP_MIN = 30

function baliDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BALI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req)
  if (denied) return denied

  const now = new Date()
  const todayBali = baliDateStr(now)

  // Candidate bookings: confirmed classes happening TODAY (studio-local), not
  // yet sent the same-day reminder.
  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      todayReminderSentAt: null,
      slot: { date: todayBali },
    },
    include: {
      slot: {
        include: {
          trainer: { select: { whatsapp: true, notifyWhatsapp: true } },
          studio: {
            select: {
              id: true,
              whatsappEnabled: true,
              remindToday: true,
              whatsappPhoneNumberId: true,
              whatsappAccessToken: true,
            },
          },
        },
      },
    },
  })

  let sent = 0
  let skippedWindow = 0
  let skippedFresh = 0
  let skippedNoWA = 0
  let failed = 0

  for (const b of bookings) {
    // Autonomous studios: only message via a studio that has its OWN WhatsApp
    // enabled. Also respect the Notifications toggle for this check-in.
    if (!b.slot.studio.whatsappEnabled || b.slot.studio.remindToday === false) {
      skippedNoWA++
      continue
    }
    // Class start in Bali local time → minutes from now.
    const startMs = Date.parse(`${b.slot.date}T${b.slot.startTime}:00+08:00`)
    if (!Number.isFinite(startMs)) {
      skippedWindow++
      continue
    }
    const minutesUntil = (startMs - now.getTime()) / 60000
    if (minutesUntil > WINDOW_MAX_MIN || minutesUntil < WINDOW_MIN_MIN) {
      skippedWindow++
      continue
    }
    // Don't follow up on a booking the client only just made.
    const ageMin = (now.getTime() - b.createdAt.getTime()) / 60000
    if (ageMin < FRESH_SKIP_MIN) {
      skippedFresh++
      continue
    }

    // Atomically CLAIM this booking before sending — set todayReminderSentAt
    // only if it's still null. If two cron runs overlap (e.g. Vercel cron +
    // an external pinger), only one wins the claim; the other sees count===0
    // and skips, so the client never gets a duplicate. On send failure we roll
    // the claim back to null so a later run retries.
    const claim = await prisma.booking.updateMany({
      where: { id: b.id, todayReminderSentAt: null },
      data: { todayReminderSentAt: new Date() },
    })
    if (claim.count === 0) continue // already claimed by a concurrent run

    const res = await sendClassTodayConfirmWA({
      clientPhone: b.clientPhone,
      studioWA: b.slot.studio,
    })

    if (!res.ok) {
      failed++
      console.warn("[today-reminders] send failed:", b.clientPhone, res.error)
      // Release the claim so the next run can retry.
      await prisma.booking.update({
        where: { id: b.id },
        data: { todayReminderSentAt: null },
      })
      continue
    }

    sent++

    // Find the client's conversation (booking phones are FORMATTED, convo
    // phones are Meta bare digits → match on the last-10-digit tail). Log the
    // reminder in the thread AND arm the trainer-forward so the client's first
    // reply reaches the trainer.
    try {
      const tail = phoneTail(b.clientPhone)
      const convos = await prisma.whatsAppConversation.findMany({
        where: { studioId: b.slot.studio.id },
        select: { id: true, clientPhone: true },
      })
      const match = convos.find((c) => phoneTail(c.clientPhone) === tail)
      // No conversation yet? This reminder is the FIRST contact with the
      // client. Create the thread now (assigning the class trainer) so the
      // reminder is logged as the opening message — otherwise the client's
      // reply later shows up alone, with no context. (Bug the owner hit.)
      const convoId =
        match?.id ??
        (
          await upsertConversation({
            studioId: b.slot.studio.id,
            clientPhone: b.clientPhone,
            clientName: b.clientName ?? null,
            assignedTrainerId: b.slot.trainerId ?? null,
          })
        ).id
      // Only arm forwarding when the trainer opted into WhatsApp notifications
      // and actually has a number on file.
      const trainerWA = b.slot.trainer?.whatsapp?.trim()
      const wantForward = !!b.slot.trainer?.notifyWhatsapp && !!trainerWA
      await prisma.whatsAppConversation.update({
        where: { id: convoId },
        data: {
          pendingReminderTrainerPhone: wantForward ? trainerWA : null,
        },
      })
      await appendOutboundMessage({
        conversationId: convoId,
        type: "template",
        body:
          "Hello! 🌿 Just a gentle reminder about your class today — are you " +
          "still able to join us? We'd love to see you on the mat. 🙏",
        templateName:
          process.env.WHATSAPP_TEMPLATE_TODAY_CONFIRM || "class_today_confirm",
        waMessageId: res.messageId ?? null,
        status: "sent",
        fromTrainerId: null,
      })
    } catch (err) {
      console.error("[today-reminders] convo log/arm failed:", err)
    }
  }

  return NextResponse.json({
    ok: true,
    date: todayBali,
    candidates: bookings.length,
    sent,
    skippedWindow,
    skippedFresh,
    skippedNoWA,
    failed,
  })
}
