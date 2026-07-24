import { prisma } from "@/lib/prisma"
import { sendClassTodayConfirmWA, sendWhatsAppTemplate, getConfigFor } from "@/lib/whatsapp-cloud"
import { appendOutboundMessage, upsertConversation } from "@/lib/whatsapp-conversation"
import { phoneTail } from "@/lib/membership"
import { elog, elogError } from "@/lib/elog"
import { baliDateStr } from "@/lib/tz"

// Pre-class roster summary to the trainer (owner 24.07.2026): ONE message per
// class, ~1h before it starts, listing who confirmed / hasn't replied /
// cancelled. Fires in a tighter window than the check-in so confirmations have
// time to land. Env-gated on WHATSAPP_TEMPLATE_TRAINER_ROSTER (a trainer has no
// open 24h window, so it must be an approved template).
const ROSTER_MAX_MIN = 90
const ROSTER_MIN_MIN = 30

// Same-day "are you still coming to today's class?" check-in — core logic.
//
// Callers:
//  - /api/cron/today-reminders (Vercel cron header / GH Actions pinger)
//  - lib/reminder-tick.ts (traffic-driven fallback: GitHub's scheduler can
//    lag HOURS, so any visit to the booking widget also gives the job a
//    chance to run — see incident 2026-06-11)
//
// For every CONFIRMED booking whose class starts ~2.5h from now (studio-local,
// Bali UTC+8) we send the approved `class_today_confirm` template and arm the
// conversation so the client's first reply is forwarded to the trainer.
// todayReminderSentAt is claimed ATOMICALLY before sending, so overlapping
// runs (cron + pinger + traffic tick) can never double-send.


// Send when the class starts within this many minutes from now. 155 gives a
// little slack above 2.5h (150); 20 is the floor so we don't ping when the
// class is basically about to start.
const WINDOW_MAX_MIN = 155
const WINDOW_MIN_MIN = 20
// Skip bookings made in the last 30 min — the client just got the booking
// confirmation, no need to immediately follow up with "still coming?".
const FRESH_SKIP_MIN = 30


export type TodayRemindersSummary = {
  ok: true
  date: string
  candidates: number
  sent: number
  skippedWindow: number
  skippedFresh: number
  skippedNoWA: number
  failed: number
}

export async function runTodayReminders(trigger: string): Promise<TodayRemindersSummary> {
  const now = new Date()
  const todayBali = baliDateStr(now)

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
              locationUrl: true,
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

  // ONE message per phone per class: a party of N books N bookings on one
  // number, and the old per-booking loop sent N identical check-ins a second
  // apart (chat audit 09.07 caught a real party of 6 receiving 6 copies).
  // Group the eligible bookings by phone tail + slot and send once per group;
  // the claim marks EVERY booking in the group so no other run re-sends.
  const groups = new Map<string, { list: typeof bookings; minutesUntil: number }>()
  for (const b of bookings) {
    if (!b.slot.studio.whatsappEnabled || b.slot.studio.remindToday === false) {
      skippedNoWA++
      continue
    }
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
    const ageMin = (now.getTime() - b.createdAt.getTime()) / 60000
    if (ageMin < FRESH_SKIP_MIN) {
      skippedFresh++
      continue
    }
    const key = `${phoneTail(b.clientPhone)}|${b.slotId}`
    const g = groups.get(key)
    if (g) g.list.push(b)
    else groups.set(key, { list: [b], minutesUntil })
  }

  for (const { list: group, minutesUntil } of groups.values()) {
    const b = group[0]

    // Atomically CLAIM the whole group before sending — only one concurrent
    // run wins; the others see count===0 and skip, so no duplicates.
    const claim = await prisma.booking.updateMany({
      where: { id: { in: group.map((g) => g.id) }, todayReminderSentAt: null },
      data: { todayReminderSentAt: new Date() },
    })
    if (claim.count === 0) continue

    const res = await sendClassTodayConfirmWA({
      clientPhone: b.clientPhone,
      locationUrl: b.slot.studio.locationUrl,
      studioWA: b.slot.studio,
      ticketCode: b.ticketCode,
    })

    if (!res.ok) {
      failed++
      console.warn("[today-reminders] send failed:", b.clientPhone, res.error)
      await elogError("reminders:today", "send failed — claim released for retry", {
        bookingId: b.id,
        phoneTail: phoneTail(b.clientPhone),
        error: res.error,
        trigger,
      })
      // Release the whole group's claim so the next run can retry.
      await prisma.booking.updateMany({
        where: { id: { in: group.map((g) => g.id) } },
        data: { todayReminderSentAt: null },
      })
      continue
    }

    sent++
    await elog("reminders:today", "sent same-day check-in", {
      bookingId: b.id,
      phoneTail: phoneTail(b.clientPhone),
      classTime: `${b.slot.date} ${b.slot.startTime}`,
      minutesUntil: Math.round(minutesUntil),
      trigger,
    })

    // Log the reminder in the client's conversation thread AND arm the
    // trainer-forward so the client's first reply reaches the trainer.
    try {
      const tail = phoneTail(b.clientPhone)
      const convos = await prisma.whatsAppConversation.findMany({
        where: { studioId: b.slot.studio.id },
        select: { id: true, clientPhone: true },
      })
      const match = convos.find((c) => phoneTail(c.clientPhone) === tail)
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
      const trainerWA = b.slot.trainer?.whatsapp?.trim()
      const wantForward = !!b.slot.trainer?.notifyWhatsapp && !!trainerWA
      await prisma.whatsAppConversation.update({
        where: { id: convoId },
        data: { pendingReminderTrainerPhone: wantForward ? trainerWA : null },
      })
      await appendOutboundMessage({
        conversationId: convoId,
        type: "template",
        body:
          "Hello 👋\n\n" +
          "Just a gentle reminder about your class today - are you still able to join us?\n\n" +
          "📍 Location:\n" + (b.slot.studio.locationUrl?.trim() || "-") + "\n\n" +
          "We'd love to see you at the studio ☀️",
        templateName:
          process.env.WHATSAPP_TEMPLATE_TODAY_CONFIRM || "class_today_confirm",
        waMessageId: res.messageId ?? null,
        status: "sent",
        fromTrainerId: null,
      })
    } catch (err) {
      console.error("[today-reminders] convo log/arm failed:", err)
      await elogError("reminders:today", "convo log/arm failed (message WAS sent)", {
        bookingId: b.id,
        error: String(err),
      })
    }
  }

  const summary: TodayRemindersSummary = {
    ok: true,
    date: todayBali,
    candidates: bookings.length,
    sent,
    skippedWindow,
    skippedFresh,
    skippedNoWA,
    failed,
  }
  // Pre-class roster to trainers (best-effort, never blocks the check-in run).
  try {
    const rosters = await sendPreClassRosters(now, todayBali)
    if (rosters) (summary as TodayRemindersSummary & { rosters?: number }).rosters = rosters
  } catch (err) {
    console.error("[today-reminders] roster pass failed:", err)
  }

  // One run-summary row per invocation — this is the heartbeat that proves
  // the job ran at all (the thing we were blind to during the incident).
  await elog("reminders:today", `run via ${trigger}`, summary)
  return summary
}

/**
 * Send each trainer ONE roster summary ~1h before their class: who confirmed
 * (tapped Confirm), who hasn't replied, who cancelled. One message per class,
 * claimed via rosterSummarySentAt so it never repeats. Returns how many were
 * sent. No-ops entirely until WHATSAPP_TEMPLATE_TRAINER_ROSTER is set (the
 * template must be Meta-approved first).
 */
async function sendPreClassRosters(now: Date, todayBali: string): Promise<number> {
  const rosterTemplate = process.env.WHATSAPP_TEMPLATE_TRAINER_ROSTER
  if (!rosterTemplate) return 0

  // Every booking of today's classes (any status), so the roster can name
  // cancellations too. Not-yet-summarised is decided per slot below.
  const rows = await prisma.booking.findMany({
    where: { slot: { date: todayBali } },
    select: {
      id: true, clientName: true, status: true,
      attendanceConfirmedAt: true, rosterSummarySentAt: true, slotId: true,
      slot: {
        select: {
          startTime: true, studioId: true,
          trainer: { select: { whatsapp: true, notifyWhatsapp: true } },
          studio: {
            select: {
              whatsappEnabled: true, remindToday: true,
              whatsappPhoneNumberId: true, whatsappAccessToken: true,
            },
          },
        },
      },
    },
  })

  // Group by slot; keep only slots inside the roster window and not yet sent.
  const bySlot = new Map<string, typeof rows>()
  for (const b of rows) {
    const g = bySlot.get(b.slotId)
    if (g) g.push(b)
    else bySlot.set(b.slotId, [b])
  }

  let rosterSent = 0
  for (const [slotId, list] of bySlot) {
    const first = list[0]
    const st = first.slot
    if (!st.studio.whatsappEnabled || st.studio.remindToday === false) continue
    const trainerWA = st.trainer?.whatsapp?.trim()
    if (!st.trainer?.notifyWhatsapp || !trainerWA) continue

    const startMs = Date.parse(`${todayBali}T${st.startTime}:00+08:00`)
    if (!Number.isFinite(startMs)) continue
    const minutesUntil = (startMs - now.getTime()) / 60000
    if (minutesUntil > ROSTER_MAX_MIN || minutesUntil < ROSTER_MIN_MIN) continue

    // A CONFIRMED booking not yet folded into a roster is the trigger; if all
    // live bookings are already summarised, skip.
    const liveUnsummarised = list.filter(
      (b) => b.status === "CONFIRMED" && !b.rosterSummarySentAt,
    )
    if (liveUnsummarised.length === 0) continue

    // Atomically claim ALL of this slot's bookings so only one run sends it.
    const claim = await prisma.booking.updateMany({
      where: { slotId, rosterSummarySentAt: null },
      data: { rosterSummarySentAt: new Date() },
    })
    if (claim.count === 0) continue

    // Build the three lines from the freshest view of the slot.
    const confirmed = list.filter((b) => b.status === "CONFIRMED" && b.attendanceConfirmedAt)
    const silent = list.filter((b) => b.status === "CONFIRMED" && !b.attendanceConfirmedAt)
    const cancelled = list.filter((b) => b.status === "CANCELLED")
    const nm = (b: (typeof list)[number]) => (b.clientName?.trim() || "Guest")
    const lines: string[] = []
    lines.push(`✅ Confirmed (${confirmed.length})${confirmed.length ? ": " + confirmed.map(nm).join(", ") : ""}`)
    lines.push(`⏳ No reply (${silent.length})${silent.length ? ": " + silent.map(nm).join(", ") : ""}`)
    if (cancelled.length) lines.push(`❌ Cancelled (${cancelled.length}): ${cancelled.map(nm).join(", ")}`)

    const res = await sendWhatsAppTemplate({
      toPhone: trainerWA,
      templateName: rosterTemplate,
      languageCode: process.env.WHATSAPP_TEMPLATE_LANG || "en",
      variables: [st.startTime, lines.join("\n")],
      config: getConfigFor(st.studio),
    })
    if (res.ok) {
      rosterSent++
      await elog("reminders:today", "sent pre-class roster to trainer", {
        slotId, classTime: `${todayBali} ${st.startTime}`,
        confirmed: confirmed.length, silent: silent.length, cancelled: cancelled.length,
      })
    } else {
      // Release the claim so the next run can retry the roster.
      await prisma.booking.updateMany({
        where: { slotId },
        data: { rosterSummarySentAt: null },
      })
      await elogError("reminders:today", "roster send failed — claim released", {
        slotId, error: res.error,
      })
    }
  }
  return rosterSent
}
