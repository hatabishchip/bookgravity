import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { phoneTail } from "@/lib/membership"

// GET /api/admin/clients
//
// The studio's client directory, derived from ALL bookings — including
// CANCELLED ones, on purpose: when an admin removes a client from a class
// (e.g. to reschedule) the booking is only marked cancelled, so the client's
// name/phone/email must still be findable here instead of being "lost".
//
// Clients are grouped by the last-10-digits of their phone (stored formats
// vary: "+62 821-4554-6405" vs "+6282145546405"), newest booking wins for the
// displayed name/phone format, newest non-empty email wins for email.
export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const bookings = await prisma.booking.findMany({
    where: { slot: { studioId: ctx.studioId } },
    select: {
      clientName: true,
      clientPhone: true,
      clientEmail: true,
      status: true,
      createdAt: true,
      slot: { select: { date: true, startTime: true } },
    },
    orderBy: { createdAt: "desc" }, // newest first → first hit per group wins
  })

  type Client = {
    name: string
    phone: string
    email: string | null
    confirmedCount: number
    cancelledCount: number
    /** Most recent class date this client was ever on (any status). */
    lastClassDate: string | null
    /** When the most recent booking was made. */
    lastBookedAt: string
  }

  const byTail = new Map<string, Client>()
  for (const b of bookings) {
    const tail = phoneTail(b.clientPhone) || b.clientPhone
    // Party bookings are stored as "Name (2/6)" — show the bare name.
    const cleanName = b.clientName.replace(/\s*\(\d+\/\d+\)$/, "").trim()
    let c = byTail.get(tail)
    if (!c) {
      c = {
        name: cleanName,
        phone: b.clientPhone,
        email: null,
        confirmedCount: 0,
        cancelledCount: 0,
        lastClassDate: null,
        lastBookedAt: b.createdAt.toISOString(),
      }
      byTail.set(tail, c)
    }
    if (!c.email && b.clientEmail) c.email = b.clientEmail
    if (b.status === "CANCELLED") c.cancelledCount += 1
    else c.confirmedCount += 1
    if (!c.lastClassDate || b.slot.date > c.lastClassDate) c.lastClassDate = b.slot.date
  }

  const clients = [...byTail.values()].sort((a, b) =>
    (b.lastClassDate ?? "").localeCompare(a.lastClassDate ?? ""),
  )
  return NextResponse.json(clients)
}
