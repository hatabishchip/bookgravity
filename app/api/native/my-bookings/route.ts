import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/native-jwt"

// GET /api/native/my-bookings
// Returns the signed-in user's confirmed bookings, identified by the email
// stored on their User row. We match Booking.clientEmail → User.email so the
// mobile app can show "your tickets" without requiring a separate client-side
// account model. The endpoint accepts a native Bearer token (web cookies
// don't apply — this is iOS / Android only).
//
// Future: a dedicated Client entity will let us match by id instead of
// email, but the current ad-hoc clientEmail flow already covers the
// common case (admins / trainers booking under their own email + clients
// who used the same email in the public widget).
export async function GET(request: NextRequest) {
  const header = request.headers.get("authorization") ?? ""
  const match = /^Bearer (.+)$/.exec(header)
  if (!match) return NextResponse.json({ error: "Missing token" }, { status: 401 })
  const payload = verifyToken(match[1])
  if (!payload || payload.type !== "access") {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { email: true },
  })
  if (!user) return NextResponse.json({ error: "User no longer exists" }, { status: 401 })

  const bookings = await prisma.booking.findMany({
    where: { clientEmail: user.email },
    orderBy: [{ slot: { date: "desc" } }, { slot: { startTime: "desc" } }],
    take: 50,
    include: {
      slot: {
        include: {
          trainer: { select: { id: true, name: true } },
          studio: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  })

  // Hide the (1/3) party suffix in the displayed clientName — admins and the
  // web widget both treat that as an internal pagination marker.
  return NextResponse.json(
    bookings.map((b) => ({
      id: b.id,
      ticketCode: b.ticketCode,
      clientName: (b.clientName ?? "").replace(/\s*\(\d+\/\d+\)$/, "").trim(),
      clientPhone: b.clientPhone,
      clientEmail: b.clientEmail,
      status: b.status,
      paymentType: b.paymentType,
      paymentStatus: b.paymentStatus,
      slot: {
        id: b.slot.id,
        date: b.slot.date,
        startTime: b.slot.startTime,
        endTime: b.slot.endTime,
        classType: b.slot.classType,
        trainer: b.slot.trainer,
        studio: b.slot.studio,
      },
    })),
  )
}
