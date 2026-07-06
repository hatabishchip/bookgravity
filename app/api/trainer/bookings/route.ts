import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getStudioMembershipBalances, getMembershipBalance, phoneTail } from "@/lib/membership"
import { upsertConversation } from "@/lib/whatsapp-conversation"
import { baliDateStr, addDaysStr } from "@/lib/tz"
import { generateUniqueTicketCode } from "@/lib/tickets"
import { syncSlotToGoogle } from "@/lib/google-calendar"
import { z } from "zod"

export async function GET(request: NextRequest) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const slotId = searchParams.get("slotId")

  const bookings = await prisma.booking.findMany({
    where: {
      // Only active bookings - a cancelled one drops off the roster entirely.
      status: "CONFIRMED",
      slot: {
        trainerId: trainer.id,
        studioId: ctx.studioId,
        // No explicit slot → rolling 60-day-back window (+ all future). Without
        // it this fetched the trainer's entire lifetime history every load,
        // growing unbounded (mirrors the admin bookings route's window).
        ...(slotId ? {} : { date: { gte: addDaysStr(baliDateStr(new Date()), -60) } }),
      },
      ...(slotId ? { slotId } : {}),
    },
    include: {
      slot: true,
      services: { include: { service: true } },
      // Bank/QRIS payments an admin linked to this booking → "confirmed by bank"
      // badge (staff-only). id-only keeps the payload small.
      bankPayments: { select: { id: true } },
    },
    orderBy: [{ slot: { date: "asc" } }, { slot: { startTime: "asc" } }],
  })

  // Attach each client's current membership balance so the trainer can offer
  // "pay from membership" only when there's a class to spend.
  const balances = await getStudioMembershipBalances(ctx.studioId)
  // Studio country + local price drive the "Local" toggle (Indonesia only).
  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { country: true, localPrice: true, membershipClassPrice: true },
  })
  const withBalance = bookings.map(({ bankPayments, ...b }) => ({
    ...b,
    membershipRemaining: balances.get(phoneTail(b.clientPhone)) ?? 0,
    studioCountry: studio?.country ?? null,
    localPrice: studio?.localPrice ?? 200000,
    memberPrice: studio?.membershipClassPrice ?? 250000,
    bankConfirmed: bankPayments.length > 0,
  }))

  return NextResponse.json(withBalance)
}

// Trainer adds a client to their OWN class by hand. The real use case: a client
// asked to be recorded but the trainer was busy during the session, so later
// that same day they enter the name themselves. Allowed only for a class dated
// TODAY (even one whose time has already passed), and only the trainer's own
// class. No capacity check (a real attendee can be over the cap) and no client
// WhatsApp confirmation (it's a post-hoc record) - we just link the chat so the
// client still appears in the inbox.
const CreateSchema = z.object({
  slotId: z.string(),
  clientName: z.string().min(1),
  clientPhone: z.string().min(3).transform((p) => p.replace(/\D/g, "")),
  clientEmail: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 })
  }
  const data = parsed.data

  const slot = await prisma.timeSlot.findFirst({ where: { id: data.slotId, studioId: ctx.studioId } })
  if (!slot) return NextResponse.json({ error: "Class not found" }, { status: 404 })
  if (slot.trainerId !== trainer.id) {
    return NextResponse.json({ error: "You can only add a client to your own class" }, { status: 403 })
  }
  if (slot.date !== baliDateStr(new Date())) {
    return NextResponse.json({ error: "You can only add a client to a class scheduled for today" }, { status: 400 })
  }

  // Unique 3-digit ticket within the slot (shared generator; 3-digit always).
  const ticketCode = await generateUniqueTicketCode(slot.id)

  const booking = await prisma.booking.create({
    data: {
      slotId: slot.id,
      clientName: data.clientName,
      clientEmail: data.clientEmail || "",
      clientPhone: data.clientPhone,
      ticketCode,
    },
    include: { slot: true, services: { include: { service: true } } },
  })

  // Link a chat (grants this trainer inbox access) WITHOUT sending the client
  // anything - this is a quiet, same-day record, not a booking confirmation.
  try {
    await upsertConversation({
      studioId: ctx.studioId,
      clientPhone: data.clientPhone,
      clientName: data.clientName,
      assignedTrainerId: trainer.id,
    })
  } catch { /* non-fatal: the booking still stands */ }

  // Google Calendar shows only classes with live bookings (Sveta's rule) -
  // this may be the slot's first booking, materialising the event. Awaited so
  // the serverless runtime can't terminate before the Calendar call lands.
  await syncSlotToGoogle(slot.id).catch(() => {})

  // Return the client's membership balance so the cabinet can immediately offer
  // "pay from membership" for the new booking.
  const membershipRemaining = await getMembershipBalance(ctx.studioId, data.clientPhone)
  return NextResponse.json({ ...booking, membershipRemaining }, { status: 201 })
}
