import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

export async function GET(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")

  const bookings = await prisma.booking.findMany({
    where: date ? { slot: { date } } : {},
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
