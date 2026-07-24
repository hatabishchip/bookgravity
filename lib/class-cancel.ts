// Class-level "trainer can't teach" actions: cancel a whole class or move it
// to another slot, notifying every booked client and keeping memberships
// intact. Built after the 04.07 incident (a trainer had no tool for this, so
// a client was cancelled with a dry robo-template and still came to the
// studio). See docs/META_class_cancel_reschedule.md.
//
// Client-facing texts: until the warm templates (T1 cancel / T2 move) are
// approved by the owner + Meta, we only ever send ALREADY-APPROVED content:
//   cancel → the existing `booking_canceled` template (unchanged), and
//   move   → the existing booking-confirmation flow (same one the per-booking
//            reschedule uses today). New wording arrives via env config
//            (WHATSAPP_TEMPLATE_CLASS_CANCELLED) with zero code changes.
import { prisma } from "@/lib/prisma"
import { restoreMembershipClass } from "@/lib/membership"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { getConfigFor, sendWhatsAppTemplate, formatLongDate } from "@/lib/whatsapp-cloud"
import { upsertConversation, appendOutboundMessage } from "@/lib/whatsapp-conversation"
import { slotStartMs, slotEndMs } from "@/lib/booking-cutoff"
import { notifyBookingCreated } from "@/lib/booking-notify"
import { CANCELLED_TEMPLATE, CANCELLED_TEXT } from "@/lib/booking-cancel"
import { unsyncSlotFromGoogle, syncSlotToGoogle } from "@/lib/google-calendar"

export type ClassActor = {
  userId: string
  /** Shown to staff in the "class cancelled by X" alert. */
  name: string
  role: "trainer" | "admin"
  /** Trainer.id when the actor IS a trainer — recorded as the author of the
   *  outbound inbox messages so the team sees who spoke. */
  trainerId?: string | null
}

export const CLASS_CANCEL_REASONS = ["sick", "emergency", "other"] as const
export type ClassCancelReason = (typeof CLASS_CANCEL_REASONS)[number]

const REASON_LABEL: Record<ClassCancelReason, string> = {
  sick: "trainer is unwell",
  emergency: "emergency",
  other: "other",
}

type ActionError = { ok: false; error: string; status: number }

/** "Friday, 4 July 09:00" — used in staff alerts and template variables. */
function classLabel(slot: { date: string; startTime: string }): string {
  return `${formatLongDate(slot.date)} ${slot.startTime}`
}

type SlotWithBookings = NonNullable<Awaited<ReturnType<typeof loadSlot>>>

function loadSlot(slotId: string, studioId: string) {
  return prisma.timeSlot.findFirst({
    where: { id: slotId, studioId },
    include: {
      trainer: { select: { id: true, name: true, whatsapp: true, notifyWhatsapp: true } },
      studio: {
        select: {
          slug: true,
          timezone: true,
          whatsappPhoneNumberId: true,
          whatsappAccessToken: true,
          whatsappDisplayPhone: true,
          bookingAlertWhatsapp: true,
          notifyAdminWhatsapp: true,
        },
      },
      bookings: {
        where: { status: "CONFIRMED" },
        select: {
          id: true,
          clientName: true,
          clientPhone: true,
          ticketCode: true,
          membershipId: true,
        },
      },
    },
  })
}

/**
 * One staff-facing alert through the approved `admin_message` template
 * ({{1}} name, {{2}} body — works outside the 24h window). Best-effort.
 */
async function sendStaffAlert(slot: SlotWithBookings, body: string, opts: { skipTrainer?: boolean }) {
  const cfg = getConfigFor(slot.studio)
  if (!cfg) return
  const templateName = process.env.WHATSAPP_TEMPLATE_ADMIN_MESSAGE || "admin_message"
  const sendTo = async (phone: string, name: string) => {
    const r = await sendWhatsAppTemplate({
      toPhone: phone,
      templateName,
      languageCode: "en",
      variables: [name, body],
      config: cfg,
    })
    if (!r.ok) console.warn("[class-cancel] staff alert failed:", phone, r.error)
  }
  const trainerWA = slot.trainer?.whatsapp?.trim()
  if (!opts.skipTrainer && slot.trainer?.notifyWhatsapp && trainerWA) {
    await sendTo(trainerWA, slot.trainer.name?.trim().split(/\s+/)[0] || "there")
  }
  if (slot.studio.notifyAdminWhatsapp !== false) {
    const adminWA = slot.studio.bookingAlertWhatsapp?.trim()
    const businessDigits = (slot.studio.whatsappDisplayPhone ?? "").replace(/\D/g, "")
    if (adminWA && adminWA.replace(/\D/g, "") !== businessDigits) {
      await sendTo(adminWA, "there")
    }
  }
}

/** One booking per distinct phone (a party books several rows on one phone —
 *  the client should hear from us once, not four times). */
function uniqueByPhone<T extends { clientPhone: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const key = r.clientPhone.replace(/\D/g, "")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Staff-alert tail: "3 client(s) notified: Anna +79..., Ben +62..." */
function clientListLine(rows: { clientName: string; clientPhone: string }[]): string {
  if (rows.length === 0) return "No clients were booked."
  const list = rows.map((r) => `${r.clientName} ${r.clientPhone}`).join(", ")
  return `${rows.length} client(s) notified: ${list}.`
}

/**
 * Cancel a whole class: every CONFIRMED booking → CANCELLED (with attribution),
 * membership classes restored exactly once, the slot becomes a tombstone
 * (cancelledAt set — hidden from public booking, struck through for staff),
 * every client gets the approved cancellation template, staff get one alert.
 */
export async function cancelClassSlot(opts: {
  slotId: string
  studioId: string
  actor: ClassActor
  reason: ClassCancelReason
}): Promise<{ ok: true; cancelledBookings: number; notifiedClients: number } | ActionError> {
  const slot = await loadSlot(opts.slotId, opts.studioId)
  if (!slot) return { ok: false, error: "Class not found", status: 404 }
  if (slot.cancelledAt) return { ok: false, error: "Class is already cancelled", status: 409 }
  const tz = slot.studio.timezone ?? undefined
  if (slotEndMs(slot.date, slot.endTime, tz) <= Date.now()) {
    return { ok: false, error: "Class has already ended", status: 400 }
  }

  const now = new Date()
  const bookings = slot.bookings
  await prisma.$transaction(async (tx) => {
    await tx.timeSlot.update({
      where: { id: slot.id },
      data: {
        cancelledAt: now,
        cancelledByUserId: opts.actor.userId,
        cancelReason: opts.reason,
      },
    })
    if (bookings.length > 0) {
      await tx.booking.updateMany({
        where: { id: { in: bookings.map((b) => b.id) } },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelledByUserId: opts.actor.userId,
          cancelledByRole: opts.actor.role,
        },
      })
    }
  })

  // Membership refunds — same order + one-shot guard as afterStaffCancellation:
  // restore, then clear the link so nothing can restore the same class twice.
  for (const b of bookings) {
    if (!b.membershipId) continue
    try {
      await restoreMembershipClass(b.membershipId)
      await prisma.booking.update({ where: { id: b.id }, data: { membershipId: null } })
    } catch (err) {
      console.error("[class-cancel] membership restore failed:", b.id, err)
    }
  }

  // Google Calendar: the class no longer happens.
  try {
    await unsyncSlotFromGoogle(slot.id)
  } catch (err) {
    console.warn("[class-cancel] gcal unsync failed:", err)
  }

  // Client notifications (best-effort; template messages work outside 24h).
  let notified = 0
  const recipients = uniqueByPhone(bookings)
  try {
    if ((await isStudioWhatsAppEnabled(opts.studioId)) && getConfigFor(slot.studio)) {
      const cfg = getConfigFor(slot.studio)!
      // Warm template (T1) once approved; the safe, already-approved
      // `booking_canceled` until then. Swapping is config, not code.
      const warmTemplate = process.env.WHATSAPP_TEMPLATE_CLASS_CANCELLED?.trim() || ""
      for (const b of recipients) {
        const r = warmTemplate
          ? await sendWhatsAppTemplate({
              toPhone: b.clientPhone,
              templateName: warmTemplate,
              languageCode: "en",
              variables: [b.clientName.trim().split(/\s+/)[0] || "there", classLabel(slot)],
              // "Book another day" URL button: bookgravity.com/{{1}} → studio page.
              buttonUrlParam: slot.studio.slug,
              config: cfg,
            })
          : await sendWhatsAppTemplate({
              toPhone: b.clientPhone,
              templateName: CANCELLED_TEMPLATE,
              languageCode: "en",
              config: cfg,
            })
        if (!r.ok) {
          console.warn("[class-cancel] client cancel notice failed:", b.clientPhone, r.error)
          continue
        }
        notified++
        try {
          const convo = await upsertConversation({
            studioId: opts.studioId,
            clientPhone: b.clientPhone,
            clientName: b.clientName,
          })
          await appendOutboundMessage({
            conversationId: convo.id,
            type: "template",
            templateName: warmTemplate || CANCELLED_TEMPLATE,
            body: warmTemplate
              ? `Class ${classLabel(slot)} cancelled - warm template sent`
              : CANCELLED_TEXT,
            fromTrainerId: opts.actor.trainerId ?? null,
          })
        } catch (err) {
          console.error("[class-cancel] inbox mirror failed:", err)
        }
      }
    }
  } catch (err) {
    console.error("[class-cancel] client notifications failed:", err)
  }

  // Staff alert: the admin always; the trainer only when someone ELSE
  // cancelled their class (the actor doesn't need a copy of their own action).
  try {
    await sendStaffAlert(
      slot,
      `Class cancelled by ${opts.actor.name}: ${slot.date}, ${slot.startTime}-${slot.endTime} ` +
        `(${REASON_LABEL[opts.reason]}). ${clientListLine(recipients)}`,
      { skipTrainer: opts.actor.role === "trainer" },
    )
  } catch (err) {
    console.error("[class-cancel] staff alert failed:", err)
  }

  return { ok: true, cancelledBookings: bookings.length, notifiedClients: notified }
}

/**
 * Move a whole class to another slot (existing or created on the spot). Every
 * CONFIRMED booking is transferred (ticket codes regenerated on collision),
 * the old slot becomes a tombstone pointing at the new one, every client gets
 * a fresh booking confirmation (the approved flow the per-booking reschedule
 * already uses), staff get one alert.
 */
export async function moveClassSlot(opts: {
  slotId: string
  studioId: string
  actor: ClassActor
  reason: ClassCancelReason
  target:
    | { kind: "existing"; slotId: string }
    | {
        kind: "new"
        date: string
        startTime: string
        endTime: string
        trainerId?: string | null
      }
}): Promise<
  | { ok: true; targetSlotId: string; movedBookings: number; notifiedClients: number }
  | ActionError
> {
  const slot = await loadSlot(opts.slotId, opts.studioId)
  if (!slot) return { ok: false, error: "Class not found", status: 404 }
  if (slot.cancelledAt) return { ok: false, error: "Class is already cancelled", status: 409 }
  const tz = slot.studio.timezone ?? undefined
  if (slotEndMs(slot.date, slot.endTime, tz) <= Date.now()) {
    return { ok: false, error: "Class has already ended", status: 400 }
  }
  if (slot.bookings.length === 0) {
    return { ok: false, error: "No confirmed bookings to move - cancel the class instead", status: 400 }
  }

  // Resolve the destination.
  let targetSlotId: string
  if (opts.target.kind === "existing") {
    if (opts.target.slotId === slot.id) {
      return { ok: false, error: "Target is the same class", status: 400 }
    }
    const target = await prisma.timeSlot.findFirst({
      where: { id: opts.target.slotId, studioId: opts.studioId, cancelledAt: null },
      include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
    })
    if (!target) return { ok: false, error: "Target class not found", status: 400 }
    if (!target.trainerId) {
      return { ok: false, error: "Target class has no trainer assigned", status: 400 }
    }
    if (slotStartMs(target.date, target.startTime, tz) <= Date.now()) {
      return { ok: false, error: "Target class is in the past", status: 400 }
    }
    if (target._count.bookings + slot.bookings.length > target.maxCapacity) {
      return { ok: false, error: "Target class does not have enough free spots", status: 409 }
    }
    targetSlotId = target.id
  } else {
    const { date, startTime, endTime } = opts.target
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return { ok: false, error: "Invalid new class date/time", status: 400 }
    }
    if (slotStartMs(date, startTime, tz) <= Date.now()) {
      return { ok: false, error: "New class time is in the past", status: 400 }
    }
    const created = await prisma.timeSlot.create({
      data: {
        date,
        startTime,
        endTime,
        trainerId: opts.target.trainerId ?? slot.trainerId,
        assistantId: slot.assistantId,
        classType: slot.classType,
        publicVisible: slot.publicVisible,
        maxCapacity: Math.max(slot.maxCapacity, slot.bookings.length),
        price: slot.price,
        studioId: opts.studioId,
      },
    })
    targetSlotId = created.id
  }

  // Transfer the group. Capacity is re-checked inside the transaction (the
  // earlier check was a plain read - a concurrent booking could overbook).
  const now = new Date()
  const moved = await prisma
    .$transaction(async (tx) => {
      const target = await tx.timeSlot.findUnique({
        where: { id: targetSlotId },
        select: { maxCapacity: true },
      })
      if (!target) throw new Error("TARGET_GONE")
      const existing = await tx.booking.findMany({
        where: { slotId: targetSlotId, status: "CONFIRMED" },
        select: { ticketCode: true },
      })
      if (existing.length + slot.bookings.length > target.maxCapacity) {
        throw new Error("TARGET_FULL")
      }
      // Ticket codes are unique per slot at creation only; moved bookings may
      // collide with codes already living in the target class. Regenerate.
      const taken = new Set(existing.map((b) => b.ticketCode))
      const patched: { id: string; ticketCode: string }[] = []
      for (const b of slot.bookings) {
        let code = b.ticketCode
        while (taken.has(code)) {
          code = String(Math.floor(100 + Math.random() * 900))
        }
        taken.add(code)
        patched.push({ id: b.id, ticketCode: code })
        await tx.booking.update({
          where: { id: b.id },
          // Reminder flags reset so the moved booking re-enters the reminder
          // chain for its NEW date (audit 25.07: flags travelled with the
          // booking and the day-before reminder never fired again).
          data: {
            slotId: targetSlotId,
            ticketCode: code,
            reminderSentAt: null,
            todayReminderSentAt: null,
            attendanceConfirmedAt: null,
            rosterSummarySentAt: null,
          },
        })
      }
      await tx.timeSlot.update({
        where: { id: slot.id },
        data: {
          cancelledAt: now,
          cancelledByUserId: opts.actor.userId,
          cancelReason: opts.reason,
          movedToSlotId: targetSlotId,
        },
      })
      return patched
    })
    .catch((e) => {
      if (e instanceof Error && (e.message === "TARGET_FULL" || e.message === "TARGET_GONE")) return null
      throw e
    })
  if (!moved) return { ok: false, error: "Target class does not have enough free spots", status: 409 }

  // Google Calendar: old event goes away, destination gets synced/updated.
  try {
    await unsyncSlotFromGoogle(slot.id)
    await syncSlotToGoogle(targetSlotId)
  } catch (err) {
    console.warn("[class-cancel] gcal move sync failed:", err)
  }

  // Fresh confirmation (new date/time/ticket) to each distinct client phone —
  // the exact flow the per-booking reschedule uses today, no new client text.
  const codeById = new Map(moved.map((m) => [m.id, m.ticketCode]))
  const recipients = uniqueByPhone(slot.bookings)
  let notified = 0
  for (const b of recipients) {
    try {
      await notifyBookingCreated({
        studioId: opts.studioId,
        slotId: targetSlotId,
        clientName: b.clientName,
        clientPhone: b.clientPhone,
        leadBookingId: b.id,
        ticketCode: codeById.get(b.id) ?? b.ticketCode,
        skipAdminAlert: true,
      })
      notified++
    } catch (err) {
      console.error("[class-cancel] move confirmation failed:", b.clientPhone, err)
    }
  }

  // Staff alert.
  try {
    const target = await prisma.timeSlot.findUnique({
      where: { id: targetSlotId },
      select: { date: true, startTime: true, endTime: true },
    })
    const targetLabel = target ? `${target.date}, ${target.startTime}-${target.endTime}` : "new time"
    await sendStaffAlert(
      slot,
      `Class moved by ${opts.actor.name}: ${slot.date}, ${slot.startTime}-${slot.endTime} ` +
        `to ${targetLabel} (${REASON_LABEL[opts.reason]}). ${clientListLine(recipients)}`,
      { skipTrainer: opts.actor.role === "trainer" },
    )
  } catch (err) {
    console.error("[class-cancel] staff alert failed:", err)
  }

  return { ok: true, targetSlotId, movedBookings: moved.length, notifiedClients: notified }
}
