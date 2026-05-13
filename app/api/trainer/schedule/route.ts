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
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const today = new Date().toISOString().split("T")[0]
  const slots = await prisma.timeSlot.findMany({
    where: {
      trainerId: trainer.id,
      date: {
        gte: from ?? today,
        ...(to ? { lte: to } : {}),
      },
    },
    include: {
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })

  return NextResponse.json(slots)
}
