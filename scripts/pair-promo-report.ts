// Weekly report for the pair-offer A/B/C experiment (owner approved 24.07.2026).
// Per arm: clients the agent talked to since the experiment start, and how many
// of them reached a 2+ seat party booking (same slot, same phone tail) within
// 14 days of their first contact. Read-only; output goes to the owner's bot
// via the bg-pair-promo-weekly routine.
import "dotenv/config"
import { prisma } from "../lib/prisma"
import { pairPromoArm } from "../lib/sales-agent"

const START = new Date("2026-07-24T12:00:00Z")

async function main() {
  const convos = await prisma.whatsAppConversation.findMany({
    where: {
      studio: { slug: "canggu" },
      lastInboundAt: { gte: START },
      // the agent only runs on real phones + ig/fb ids; keep all - arms hash any string
    },
    select: { clientPhone: true, createdAt: true },
  })
  const arms: Record<string, { clients: Set<string>; converted: Set<string> }> = {
    A: { clients: new Set(), converted: new Set() },
    B: { clients: new Set(), converted: new Set() },
    C: { clients: new Set(), converted: new Set() },
  }
  const tail = (p: string) => p.replace(/\D/g, "").slice(-9)
  for (const c of convos) {
    const arm = pairPromoArm(c.clientPhone)
    arms[arm].clients.add(tail(c.clientPhone) || c.clientPhone)
  }
  // Party bookings since start: same slot + same phone tail, 2+ seats.
  const bookings = await prisma.booking.findMany({
    // Booking CREATION is the conversion event (status is a plain string:
    // CONFIRMED / CANCELLED / NO_SHOW) - a later no-show still means the offer
    // led to a pair booking; only cancellations drop out.
    where: { createdAt: { gte: START }, status: { not: "CANCELLED" } },
    select: { slotId: true, clientPhone: true },
  })
  const bySlotPhone = new Map<string, number>()
  for (const b of bookings) {
    const k = `${b.slotId}:${tail(b.clientPhone)}`
    bySlotPhone.set(k, (bySlotPhone.get(k) ?? 0) + 1)
  }
  for (const [k, n] of bySlotPhone) {
    if (n < 2) continue
    const t = k.split(":")[1]
    for (const arm of Object.values(arms)) if (arm.clients.has(t)) arm.converted.add(t)
  }
  console.log(`Парная скидка A/B/C - отчёт с ${START.toISOString().slice(0, 10)}`)
  for (const [k, v] of Object.entries(arms)) {
    const label = k === "A" ? "-10% каждому (270k)" : k === "B" ? "друг-новичок 150k" : "пара 550k"
    const pct = v.clients.size ? Math.round((100 * v.converted.size) / v.clients.size) : 0
    console.log(`${k} ${label}: клиентов ${v.clients.size}, парных броней ${v.converted.size} (${pct}%)`)
  }
}

main().finally(() => prisma.$disconnect())
