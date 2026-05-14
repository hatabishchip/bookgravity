import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

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
