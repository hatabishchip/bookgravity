import { NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { baliDateStr, addDaysStr } from "@/lib/tz"

export const dynamic = "force-dynamic"

// Two things for the trainer cabinet's payment workflow:
//
//  slot   — the just-ended class TODAY that still has unpaid clients. The
//           cabinet auto-opens it as a nudge (closable since 2026-06-12 —
//           the old hard lock annoyed trainers mid-day).
//  unpaid — ALL ended classes from the last 7 days that still have unpaid
//           CONFIRMED clients. Drives the bell badge (one +1 per client) and
//           the "Collect payments" section in the bell modal, so a dismissed
//           payment window never silently disappears — it becomes an open
//           task instead.

const LOOKBACK_DAYS = 7

export async function GET() {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ slot: null, unpaid: [] }, { status: 401 })

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
    select: { id: true },
  })
  if (!trainer) return NextResponse.json({ slot: null, unpaid: [] })

  const now = new Date()
  const todayBali = baliDateStr(now)
  const fromBali = addDaysStr(todayBali, -LOOKBACK_DAYS)
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now)
  const [nh, nm] = hm.split(":").map(Number)
  const nowMin = nh * 60 + nm

  const slots = await prisma.timeSlot.findMany({
    where: {
      trainerId: trainer.id,
      studioId: ctx.studioId,
      date: { gte: fromBali, lte: todayBali },
    },
    include: {
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      bookings: {
        where: { status: "CONFIRMED" },
        select: { clientName: true, paymentStatus: true },
      },
    },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
  })

  const ended = (s: (typeof slots)[number]) => {
    if (s.date < todayBali) return true
    const [eh, em] = s.endTime.split(":").map(Number)
    return eh * 60 + em <= nowMin
  }

  const toSlot = (s: (typeof slots)[number]) => ({
    id: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    state: "mine" as const,
    maxCapacity: s.maxCapacity,
    _count: { bookings: s._count.bookings },
  })

  const unpaid = slots
    .filter((s) => ended(s) && s.bookings.some((b) => b.paymentStatus !== "PAID"))
    .map((s) => ({
      slot: toSlot(s),
      unpaidCount: s.bookings.filter((b) => b.paymentStatus !== "PAID").length,
      clients: s.bookings
        .filter((b) => b.paymentStatus !== "PAID")
        .map((b) => b.clientName.replace(/\s*\(\d+\/\d+\)$/, "").trim()),
    }))

  // The auto-open nudge: today's most recently ended class with unpaid clients.
  const gate = unpaid.find((u) => u.slot.date === todayBali) ?? null

  return NextResponse.json({ slot: gate?.slot ?? null, unpaid })
}
