import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

async function requireTrainer() {
  const session = await auth()
  if (!session || session.user.role !== "TRAINER") return null
  return session
}

async function getBookingForTrainer(bookingId: string, trainerId: string) {
  return prisma.booking.findFirst({
    where: { id: bookingId, slot: { trainerId } },
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireTrainer()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const trainer = await prisma.trainer.findUnique({ where: { userId: session.user.id } })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const booking = await getBookingForTrainer(id, trainer.id)
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { serviceId } = await request.json()
  if (!serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 })

  await prisma.bookingService.upsert({
    where: { bookingId_serviceId: { bookingId: id, serviceId } },
    create: { bookingId: id, serviceId },
    update: {},
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireTrainer()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const trainer = await prisma.trainer.findUnique({ where: { userId: session.user.id } })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const booking = await getBookingForTrainer(id, trainer.id)
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const serviceId = searchParams.get("serviceId")
  if (!serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 })

  await prisma.bookingService.deleteMany({ where: { bookingId: id, serviceId } })

  return NextResponse.json({ success: true })
}
