import { NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Returns the trainer's just-ended class (today, studio-local) that still has
// unpaid clients — used to show a blocking "collect payments" gate when the
// trainer opens their cabinet. Returns { slot: null } when there's nothing to
// collect. Scoped to TODAY so old unpaid classes don't nag forever.

const BALI_TZ = "Asia/Makassar" // WITA, UTC+8

export async function GET() {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ slot: null }, { status: 401 })

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
    select: { id: true },
  })
  if (!trainer) return NextResponse.json({ slot: null })

  const now = new Date()
  const todayBali = new Intl.DateTimeFormat("en-CA", {
    timeZone: BALI_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now)
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: BALI_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now) // "HH:MM"
  const [nh, nm] = hm.split(":").map(Number)
  const nowMin = nh * 60 + nm

  const slots = await prisma.timeSlot.findMany({
    where: { trainerId: trainer.id, studioId: ctx.studioId, date: todayBali },
    include: {
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      bookings: { where: { status: "CONFIRMED" }, select: { paymentStatus: true } },
    },
    orderBy: { startTime: "asc" },
  })

  for (const s of slots) {
    const [eh, em] = s.endTime.split(":").map(Number)
    if (eh * 60 + em > nowMin) continue // class hasn't ended yet
    if (s.bookings.length === 0) continue
    if (!s.bookings.some((b) => b.paymentStatus !== "PAID")) continue // all paid
    return NextResponse.json({
      slot: {
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        state: "mine",
        maxCapacity: s.maxCapacity,
        _count: { bookings: s._count.bookings },
      },
    })
  }

  return NextResponse.json({ slot: null })
}
