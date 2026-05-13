import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const BookingSchema = z.object({
  slotId: z.string(),
  clientName: z.string().min(2),
  clientEmail: z.string().email(),
  clientPhone: z.string().min(5),
  serviceIds: z.array(z.string()).optional(),
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

    const slot = await prisma.timeSlot.findUnique({
      where: { id: data.slotId },
      include: { _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
    })

    if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 })
    if (slot._count.bookings >= slot.maxCapacity) {
      return NextResponse.json({ error: "Slot is fully booked" }, { status: 409 })
    }

    const existing = await prisma.booking.findFirst({
      where: { slotId: data.slotId, clientEmail: data.clientEmail, status: "CONFIRMED" },
    })
    if (existing) {
      return NextResponse.json({ error: "You have already booked this slot" }, { status: 409 })
    }

    const ticketCode = await generateUniqueCode(data.slotId)

    const booking = await prisma.booking.create({
      data: {
        slotId: data.slotId,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
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

    return NextResponse.json(booking, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
