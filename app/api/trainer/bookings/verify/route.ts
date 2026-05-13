import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session || session.user.role !== "TRAINER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const trainer = await prisma.trainer.findUnique({ where: { userId: session.user.id } })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const { bookingId, code } = await request.json()
  if (!bookingId || !code) return NextResponse.json({ error: "bookingId and code required" }, { status: 400 })

  const booking = await prisma.booking.findFirst({
    where: {
      id: bookingId,
      status: "CONFIRMED",
      slot: { trainerId: trainer.id },
    },
    select: { id: true, ticketCode: true, checkedIn: true },
  })

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (booking.ticketCode !== String(code)) return NextResponse.json({ error: "Wrong code" }, { status: 400 })

  if (!booking.checkedIn) {
    await prisma.booking.update({ where: { id: booking.id }, data: { checkedIn: true } })
  }

  return NextResponse.json({ ok: true, alreadyCheckedIn: booking.checkedIn })
}
