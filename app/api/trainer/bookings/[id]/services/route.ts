import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

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

  // Upsert: adding a service defaults its payment to CASH; calling again with a
  // paymentType just updates how that extra service was paid.
  await prisma.bookingService.upsert({
    where: { bookingId_serviceId: { bookingId: id, serviceId } },
    create: { bookingId: id, serviceId, paymentType: method ?? "CASH" },
    update: method ? { paymentType: method } : {},
  })

  return NextResponse.json({ success: true })
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
