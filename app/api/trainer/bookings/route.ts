import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

async function requireTrainer() {
  const session = await auth()
  if (!session || session.user.role !== "TRAINER") return null
  return session
}

export async function GET(request: NextRequest) {
  const session = await requireTrainer()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainer = await prisma.trainer.findUnique({
    where: { userId: session.user.id },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const slotId = searchParams.get("slotId")

  const bookings = await prisma.booking.findMany({
    where: {
      slot: { trainerId: trainer.id },
      status: "CONFIRMED",
      ...(slotId ? { slotId } : {}),
    },
    include: {
      slot: true,
      services: { include: { service: true } },
    },
    orderBy: [{ slot: { date: "asc" } }, { slot: { startTime: "asc" } }],
  })

  return NextResponse.json(bookings)
}
