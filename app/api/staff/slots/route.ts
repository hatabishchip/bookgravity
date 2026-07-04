import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

// GET /api/staff/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Read-only schedule for cleaning/support staff. Returns ONLY when a class
// occupies the room — no class type, no trainer, no booking counts, no client
// data. Even hidden (publicVisible = false) classes are included, because the
// room is still in use during them and the cleaner needs to know.
export async function GET(request: NextRequest) {
  const ctx = await requireStaff()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  if (!from || !to) {
    return NextResponse.json({ error: "from/to required (YYYY-MM-DD)" }, { status: 400 })
  }

  const slots = await prisma.timeSlot.findMany({
    where: {
      studioId: ctx.studioId,
      date: { gte: from, lte: to },
      // Cleaning staff plan around classes that HAPPEN — hide cancelled ones.
      cancelledAt: null,
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    // INTENTIONAL minimal projection — no trainer, no classType, no maxCapacity,
    // no client data. We DO expose a single privacy-safe boolean (hasBookings)
    // so the cleaner can tell which classes actually have guests coming and when
    // the first ones arrive - but never a count and never a name.
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
    },
  })

  const result = slots.map((s) => ({
    id: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    hasBookings: s._count.bookings > 0,
  }))

  return NextResponse.json(result)
}
