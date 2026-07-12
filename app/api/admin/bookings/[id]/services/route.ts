import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

// Admin add / remove an add-on service (e.g. Gravity lifting) on any booking
// in this studio (Sveta 12.07: "how do I add lifting?" - the expanded booking
// used to show services only as read-only chips). Mirrors the trainer variant
// under /api/trainer/bookings/[id]/services, admin-scoped.

async function getBookingForAdmin(bookingId: string, studioId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, slot: { studioId } },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const booking = await getBookingForAdmin(id, ctx.studioId)
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { serviceId, paymentType } = await request.json()
  if (!serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 })

  const VALID_METHODS = ["CASH", "EDC", "QR", "TRANSFER"]
  const method =
    typeof paymentType === "string" && VALID_METHODS.includes(paymentType) ? paymentType : null

  const service = await prisma.additionalService.findFirst({
    where: { id: serviceId, studioId: ctx.studioId },
  })
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 })

  // Add-on service defaults to CASH; a second call with paymentType just
  // updates how that extra was paid (upsert keeps the row idempotent).
  await prisma.bookingService.upsert({
    where: { bookingId_serviceId: { bookingId: id, serviceId } },
    create: { bookingId: id, serviceId, paymentType: method ?? "CASH" },
    update: method ? { paymentType: method } : {},
  })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const booking = await getBookingForAdmin(id, ctx.studioId)
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const serviceId = new URL(request.url).searchParams.get("serviceId")
  if (!serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 })

  await prisma.bookingService.deleteMany({
    where: { bookingId: id, serviceId, booking: { slot: { studioId: ctx.studioId } } },
  })
  return NextResponse.json({ success: true })
}
