import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { notifyBookingCreated } from "@/lib/booking-notify"
import { z } from "zod"

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")

  const bookings = await prisma.booking.findMany({
    where: {
      slot: {
        studioId: ctx.studioId,
        ...(date ? { date } : {}),
      },
    },
    include: {
      slot: {
        include: { trainer: { select: { id: true, name: true } } },
      },
      services: { include: { service: true } },
    },
    orderBy: [{ slot: { date: "asc" } }, { slot: { startTime: "asc" } }, { createdAt: "asc" }],
  })

  return NextResponse.json(bookings)
}

const BookingSchema = z.object({
  slotId: z.string(),
  clientName: z.string().min(1),
  clientPhone: z.string().min(3),
  clientEmail: z.string().optional(),
  clientTelegram: z.string().optional(),
  serviceIds: z.array(z.string()).optional(),
  partySize: z.number().int().min(1).max(6).default(1),
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
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }
  const parsed = BookingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 })
  }
  const data = parsed.data

  const slot = await prisma.timeSlot.findFirst({
    where: { id: data.slotId, studioId: ctx.studioId },
    include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
  })
  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 })

  if (data.serviceIds?.length) {
    const services = await prisma.additionalService.findMany({
      where: { id: { in: data.serviceIds }, studioId: ctx.studioId },
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

  const bookings = []
  for (let i = 0; i < data.partySize; i++) {
    const ticketCode = await generateUniqueCode(data.slotId)
    const b = await prisma.booking.create({
      data: {
        slotId: data.slotId,
        clientName: data.partySize > 1 ? `${data.clientName} (${i + 1}/${data.partySize})` : data.clientName,
        clientEmail: data.clientEmail || "",
        clientPhone: data.clientPhone,
        clientTelegram: data.clientTelegram || null,
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

  // Mirror the public booking flow: open/refresh the WhatsApp conversation,
  // send the client a confirmation, and alert the trainer — so an
  // admin-created booking still shows up as a chat in the inbox. The admin
  // alert copy is skipped (the admin is the one who just booked it).
  await notifyBookingCreated({
    studioId: ctx.studioId,
    slotId: data.slotId,
    clientName: data.clientName,
    clientPhone: data.clientPhone,
    leadBookingId: bookings[0].id,
    ticketCode: bookings[0].ticketCode,
    skipAdminAlert: true,
  })

  return NextResponse.json(bookings[0], { status: 201 })
}
