// Scenario test for the trainer cash-safe engine (lib/safe) on a SCRATCH
// SQLite DB. Refuses to run against anything but a local file: DB.
//
// Usage:
//   DB=/tmp/safe-test.db
//   rm -f $DB && npx prisma db push --url "file:$DB"
//   DATABASE_URL=file:$DB TURSO_AUTH_TOKEN= npx tsx scripts/dev-test-safe.ts
import assert from "node:assert"

if (!(process.env.DATABASE_URL ?? "").startsWith("file:")) {
  console.error("Refusing to run: DATABASE_URL must be a local file: DB")
  process.exit(1)
}

import { prisma } from "../lib/prisma"
import { computeSafeBalances } from "../lib/safe"

const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)

async function main() {
  const studio = await prisma.studio.create({
    data: {
      name: "Safe Test", slug: `safe-${Date.now()}`, safeEnabled: true,
      localPrice: 200000, membershipClassPrice: 250000,
    },
  })
  const u1 = await prisma.user.create({ data: { email: `a${Date.now()}@t.local`, password: "x", role: "TRAINER", studioId: studio.id } })
  const u2 = await prisma.user.create({ data: { email: `b${Date.now()}@t.local`, password: "x", role: "TRAINER", studioId: studio.id } })
  const adminU = await prisma.user.create({ data: { email: `c${Date.now()}@t.local`, password: "x", role: "ADMIN", studioId: studio.id } })
  const t1 = await prisma.trainer.create({ data: { name: "Dita", userId: u1.id, studioId: studio.id } })
  const t2 = await prisma.trainer.create({ data: { name: "Seni", userId: u2.id, studioId: studio.id } })

  const slot1 = await prisma.timeSlot.create({
    data: { date: tomorrow, startTime: "09:00", endTime: "11:00", trainerId: t1.id, studioId: studio.id, price: 300000 },
  })
  const slot2 = await prisma.timeSlot.create({
    data: { date: tomorrow, startTime: "13:00", endTime: "15:00", trainerId: t2.id, studioId: studio.id, price: 300000 },
  })

  // 1. CASH paid, marked by trainer 1 (their own class) -> t1 +300k.
  await prisma.booking.create({
    data: { slotId: slot1.id, clientName: "A", clientEmail: "", clientPhone: "+620001", ticketCode: "101", paymentStatus: "PAID", paymentType: "CASH", paymentMarkedByUserId: u1.id },
  })
  // 2. CASH paid, HISTORY row (no marker) on trainer 2's class -> fallback t2 +300k.
  await prisma.booking.create({
    data: { slotId: slot2.id, clientName: "B", clientEmail: "", clientPhone: "+620002", ticketCode: "102", paymentStatus: "PAID", paymentType: "CASH" },
  })
  // 3. CASH paid on t2's class but marked by trainer 1 (covered the door) -> t1 +300k.
  await prisma.booking.create({
    data: { slotId: slot2.id, clientName: "C", clientEmail: "", clientPhone: "+620003", ticketCode: "103", paymentStatus: "PAID", paymentType: "CASH", paymentMarkedByUserId: u1.id },
  })
  // 4. CASH paid marked by the ADMIN (not a trainer) -> falls back to slot trainer t1 +200k (LOCAL tier).
  await prisma.booking.create({
    data: { slotId: slot1.id, clientName: "D", clientEmail: "", clientPhone: "+620004", ticketCode: "104", paymentStatus: "PAID", paymentType: "CASH", paymentMarkedByUserId: adminU.id, priceTier: "LOCAL", localResident: true },
  })
  // 5. EDC paid -> never in a safe.
  await prisma.booking.create({
    data: { slotId: slot1.id, clientName: "E", clientEmail: "", clientPhone: "+620005", ticketCode: "105", paymentStatus: "PAID", paymentType: "EDC", paymentMarkedByUserId: u1.id },
  })
  // 6. CASH but UNPAID -> not counted.
  await prisma.booking.create({
    data: { slotId: slot1.id, clientName: "F", clientEmail: "", clientPhone: "+620006", ticketCode: "106", paymentStatus: "UNPAID", paymentType: "CASH" },
  })
  // 7. Cash pass sold by trainer 2: 5 x 250k -> t2 +1.25M.
  await prisma.membership.create({
    data: { studioId: studio.id, clientPhone: "+620007", totalClasses: 5, remainingClasses: 5, classPrice: 250000, paymentType: "CASH", soldByUserId: u2.id },
  })
  // 8. Cash pass sold by the ADMIN -> no trainer safe involved.
  await prisma.membership.create({
    data: { studioId: studio.id, clientPhone: "+620008", totalClasses: 5, remainingClasses: 5, classPrice: 250000, paymentType: "CASH", soldByUserId: adminU.id },
  })

  // Manual operations on t1: owner took 100k, salary 200k from safe, recount +50k.
  await prisma.safeOperation.createMany({
    data: [
      { studioId: studio.id, trainerId: t1.id, kind: "withdrawal", amount: -100000, createdByUserId: adminU.id },
      { studioId: studio.id, trainerId: t1.id, kind: "salary", amount: -200000, createdByUserId: adminU.id },
      { studioId: studio.id, trainerId: t1.id, kind: "correction", amount: 50000, note: "recount", createdByUserId: adminU.id },
    ],
  })

  const balances = await computeSafeBalances(studio.id)
  const b1 = balances.find((b) => b.trainerId === t1.id)!
  const b2 = balances.find((b) => b.trainerId === t2.id)!

  // t1: 300k (own) + 300k (marked on t2's class) + 200k (admin-marked fallback LOCAL) = 800k in; ops -250k.
  assert.equal(b1.cashIn, 800000, `t1 cashIn: ${b1.cashIn}`)
  assert.equal(b1.opsTotal, -250000, `t1 ops: ${b1.opsTotal}`)
  assert.equal(b1.balance, 550000, `t1 balance: ${b1.balance}`)
  // t2: 300k (history fallback) + 1.25M (cash pass) = 1.55M; no ops.
  assert.equal(b2.cashIn, 1550000, `t2 cashIn: ${b2.cashIn}`)
  assert.equal(b2.balance, 1550000, `t2 balance: ${b2.balance}`)

  console.log("SAFE SCENARIOS PASSED ✅", { t1: b1.balance, t2: b2.balance })
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
