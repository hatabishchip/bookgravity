import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { baliDateStr } from "@/lib/tz"
import { elog } from "@/lib/elog"
import { sendPush } from "@/lib/expo-push"

export const dynamic = "force-dynamic"

const ActionSchema = z.object({ action: z.enum(["accept", "decline", "cancel"]) })

// PATCH /api/trainer/handovers/[id]  { action }
//  accept  — target trainer takes the class: slot, client chats and the armed
//            reminder-forward all move atomically to them.
//  decline — target trainer says no; sender sees it in their outgoing list.
//  cancel  — sender withdraws a pending offer.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
    select: { id: true, name: true, whatsapp: true, notifyWhatsapp: true },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const { id } = await params
  const { action } = ActionSchema.parse(await request.json())

  const handover = await prisma.slotHandover.findFirst({
    where: { id, studioId: ctx.studioId },
  })
  if (!handover) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (action === "cancel") {
    if (handover.fromTrainerId !== trainer.id) {
      return NextResponse.json({ error: "Only the sender can cancel" }, { status: 403 })
    }
    const claimed = await prisma.slotHandover.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    })
    if (claimed.count === 0) return NextResponse.json({ error: "Already resolved" }, { status: 409 })
    return NextResponse.json({ ok: true, status: "CANCELLED" })
  }

  // accept / decline — target only.
  if (handover.toTrainerId !== trainer.id) {
    return NextResponse.json({ error: "This request isn't addressed to you" }, { status: 403 })
  }

  if (action === "decline") {
    const claimed = await prisma.slotHandover.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "DECLINED", resolvedAt: new Date() },
    })
    if (claimed.count === 0) return NextResponse.json({ error: "Already resolved" }, { status: 409 })
    void elog("handover", "declined", { handoverId: id, by: trainer.name })
    notifySender(handover.fromTrainerId, `${trainer.name} declined the class handover.`)
    return NextResponse.json({ ok: true, status: "DECLINED" })
  }

  // ACCEPT — atomic claim first so a race (cancel vs accept) has one winner.
  const slot = await prisma.timeSlot.findFirst({ where: { id: handover.slotId, studioId: ctx.studioId } })
  if (!slot) return NextResponse.json({ error: "Class no longer exists" }, { status: 410 })
  if (slot.date < baliDateStr(new Date())) {
    await prisma.slotHandover.updateMany({ where: { id, status: "PENDING" }, data: { status: "EXPIRED", resolvedAt: new Date() } })
    return NextResponse.json({ error: "Class is already in the past" }, { status: 410 })
  }
  if (slot.trainerId !== handover.fromTrainerId) {
    // The schedule changed under the request (admin reassigned etc.).
    await prisma.slotHandover.updateMany({ where: { id, status: "PENDING" }, data: { status: "EXPIRED", resolvedAt: new Date() } })
    return NextResponse.json({ error: "The class changed owner - ask for a new handover" }, { status: 409 })
  }

  const claimed = await prisma.slotHandover.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "ACCEPTED", resolvedAt: new Date() },
  })
  if (claimed.count === 0) return NextResponse.json({ error: "Already resolved" }, { status: 409 })

  // The actual transfer: slot → me, plus every CONFIRMED client's chat and
  // any armed same-day-reminder forward follow the class.
  await prisma.timeSlot.update({ where: { id: slot.id }, data: { trainerId: trainer.id } })

  try {
    const bookings = await prisma.booking.findMany({
      where: { slotId: slot.id, status: "CONFIRMED" },
      select: { clientPhone: true },
    })
    const tails = bookings
      .map((b) => b.clientPhone.replace(/\D/g, "").slice(-10))
      .filter((t) => t.length >= 6)
    for (const tail of tails) {
      const convo = await prisma.whatsAppConversation.findFirst({
        where: { studioId: ctx.studioId, clientPhone: { endsWith: tail } },
        select: { id: true, pendingReminderTrainerPhone: true },
      })
      if (!convo) continue
      await prisma.whatsAppConversation.update({
        where: { id: convo.id },
        data: {
          assignedTrainerId: trainer.id,
          // If the "first reply goes to the trainer" forward is armed, point
          // it at the new trainer (or disarm if they opted out of WhatsApp).
          ...(convo.pendingReminderTrainerPhone
            ? { pendingReminderTrainerPhone: trainer.notifyWhatsapp && trainer.whatsapp?.trim() ? trainer.whatsapp.trim() : null }
            : {}),
        },
      })
    }
  } catch (err) {
    console.error("[handover] chat reassign failed (slot transfer DONE):", err)
  }

  void elog("handover", "accepted — class transferred", {
    handoverId: id, slotId: slot.id, to: trainer.name, classTime: `${slot.date} ${slot.startTime}`,
  })
  notifySender(handover.fromTrainerId, `${trainer.name} accepted your class - ${slot.date} ${slot.startTime} is now theirs.`)

  return NextResponse.json({ ok: true, status: "ACCEPTED" })
}

function notifySender(fromTrainerId: string, body: string) {
  prisma.trainer
    .findUnique({ where: { id: fromTrainerId }, select: { userId: true } })
    .then((t) => t && sendPush({ userId: t.userId, title: "Class handover", body, data: { type: "handover" } }))
    .catch(() => {})
}
