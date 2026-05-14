import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getDefaultStudioId } from "@/lib/studio"
import { z } from "zod"

const BookingSchema = z.object({
  slotId: z.string(),
  clientName: z.string().min(2),
  clientEmail: z.string().email().optional().or(z.literal("")),
  clientPhone: z.string().min(5),
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
  try {
    const body = await request.json()
    const data = BookingSchema.parse(body)

    const studioId = await getDefaultStudioId()
    const slot = await prisma.timeSlot.findFirst({
      where: { id: data.slotId, studioId },
      include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
    })

    if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 })

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

    const existing = await prisma.booking.findFirst({
      where: { slotId: data.slotId, clientPhone: data.clientPhone, status: "CONFIRMED" },
    })
    if (existing) {
      return NextResponse.json({ error: "You have already booked this slot" }, { status: 409 })
    }

    // Create N bookings (one per person), all sharing the same lead's name+phone
    const bookings = []
    for (let i = 0; i < data.partySize; i++) {
      const ticketCode = await generateUniqueCode(data.slotId)
      const b = await prisma.booking.create({
        data: {
          slotId: data.slotId,
          clientName: data.partySize > 1 ? `${data.clientName} (${i + 1}/${data.partySize})` : data.clientName,
          clientEmail: data.clientEmail || "",
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

    // Return the lead booking (first one)
    return NextResponse.json(bookings[0], { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
