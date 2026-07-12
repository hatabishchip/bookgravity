import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { defaultServiceMethod } from "@/lib/booking-payment"

async function getBookingForTrainer(bookingId: string, trainerId: string, studioId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, slot: { trainerId, studioId } },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const booking = await getBookingForTrainer(id, trainer.id, ctx.studioId)
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "Cannot add a service to a cancelled booking" }, { status: 400 })
  }

  const { serviceId, paymentType } = await request.json()
  if (!serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 })

  const VALID_METHODS = ["CASH", "EDC", "QR", "TRANSFER"]
  const method =
    typeof paymentType === "string" && VALID_METHODS.includes(paymentType) ? paymentType : null

  // Verify the service belongs to this studio
  const service = await prisma.additionalService.findFirst({
    where: { id: serviceId, studioId: ctx.studioId },
  })
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 })

  // No explicit method -> honest default (audit 12.07): inherit the class's
  // POS method when the class is paid, CASH on a membership class, else null
  // until the class payment is recorded (sync fills it in then). Calling again
  // with a paymentType just updates how that extra service was paid.
  const fallback = defaultServiceMethod(booking)
  await prisma.bookingService.upsert({
    where: { bookingId_serviceId: { bookingId: id, serviceId } },
    create: { bookingId: id, serviceId, paymentType: method ?? fallback },
    update: method ? { paymentType: method } : {},
  })

  return NextResponse.json({ success: true, paymentType: method ?? fallback })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const booking = await getBookingForTrainer(id, trainer.id, ctx.studioId)
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const serviceId = searchParams.get("serviceId")
  if (!serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 })

  await prisma.bookingService.deleteMany({
    where: {
      bookingId: id,
      serviceId,
      booking: { slot: { studioId: ctx.studioId } },
    },
  })

  return NextResponse.json({ success: true })
}
