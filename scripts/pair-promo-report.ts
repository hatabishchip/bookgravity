// Weekly report for the REFERRAL offer (research-backed mechanic, owner
// 24.07.2026: friend's first class 150k, referrer gets a free class once the
// friend buys a package). Filename kept from the earlier A/B/C draft so the
// bg-pair-promo-weekly routine keeps working. Read-only; output goes to the
// owner's bot.
//
// The research prescribes three success metrics:
// 1. referred first visits - new clients who first appear inside a party
//    booking alongside an existing client (our closest automatic proxy for
//    "brought by a friend");
// 2. friend -> package conversion - how many of those new clients later book
//    again (a repeat booking is the observable step toward a package);
// 3. full-price share - party bookings must not eat the full-price base.
import "dotenv/config"
import { prisma } from "../lib/prisma"

const START = new Date("2026-07-24T12:00:00Z")

const tail = (p: string) => p.replace(/\D/g, "").slice(-9) || p

async function main() {
  const bookings = await prisma.booking.findMany({
    where: { createdAt: { gte: START }, status: { not: "CANCELLED" }, slot: { studio: { slug: "canggu" } } },
    orderBy: { createdAt: "asc" },
    select: { slotId: true, clientPhone: true, createdAt: true },
  })
  const totalBookings = bookings.length

  // "Came together" = 2+ bookings on the same slot created within 10 minutes
  // of each other (covers both one party booking and a friend booking right
  // after being invited).
  const bySlot = new Map<string, { phone: string; at: number }[]>()
  for (const b of bookings) {
    const list = bySlot.get(b.slotId) ?? []
    list.push({ phone: tail(b.clientPhone), at: b.createdAt.getTime() })
    bySlot.set(b.slotId, list)
  }

  // Phones with any booking BEFORE the experiment = existing clients.
  const old = await prisma.booking.findMany({
    where: { createdAt: { lt: START }, slot: { studio: { slug: "canggu" } } },
    select: { clientPhone: true },
  })
  const existing = new Set(old.map((b) => tail(b.clientPhone)))

  const referredNew = new Set<string>() // new phone that came together with an existing client
  const partySeen = new Set<string>() // slot:phone pairs inside a party
  for (const [slotId, list] of bySlot) {
    for (const a of list) {
      const together = list.filter((x) => Math.abs(x.at - a.at) < 10 * 60_000)
      if (together.length < 2) continue
      partySeen.add(`${slotId}:${a.phone}`)
      const withExisting = together.some((x) => x.phone !== a.phone && existing.has(x.phone))
      if (withExisting && !existing.has(a.phone)) referredNew.add(a.phone)
    }
  }
  const partyBookings = partySeen.size

  // Referred newcomers who came back for another slot = on the path to a package.
  const byPhone = new Map<string, Set<string>>()
  for (const b of bookings) {
    const t = tail(b.clientPhone)
    const s = byPhone.get(t) ?? new Set()
    s.add(b.slotId)
    byPhone.set(t, s)
  }
  const repeat = [...referredNew].filter((p) => (byPhone.get(p)?.size ?? 0) >= 2).length

  const partyShare = totalBookings ? Math.round((100 * partyBookings) / totalBookings) : 0
  console.log(`Referral-оффер - отчёт с ${START.toISOString().slice(0, 10)}`)
  console.log(`Броней всего: ${totalBookings}, из них пришли вместе: ${partyBookings} (${partyShare}%)`)
  console.log(`Новички, пришедшие с существующим клиентом (referred): ${referredNew.size}`)
  console.log(`Из них забронировали повторно: ${repeat}`)
  console.log(`Доля броней по полной цене (вне парных приходов): ${100 - partyShare}%`)
}

main().finally(() => prisma.$disconnect())
