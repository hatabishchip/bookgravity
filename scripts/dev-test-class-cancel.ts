// Scenario test for the whole-class cancel/move engine (lib/class-cancel) on a
// SCRATCH SQLite DB. Never run against prod — it refuses non-file DATABASE_URLs.
//
// Usage:
//   DB=/tmp/class-cancel-test.db
//   rm -f $DB && DATABASE_URL=file:$DB npx prisma db push --skip-generate
//   DATABASE_URL=file:$DB npx tsx scripts/dev-test-class-cancel.ts
import assert from "node:assert"

if (!(process.env.DATABASE_URL ?? "").startsWith("file:")) {
  console.error("Refusing to run: DATABASE_URL must be a local file: DB")
  process.exit(1)
}

import { prisma } from "../lib/prisma"
import { cancelClassSlot, moveClassSlot } from "../lib/class-cancel"

const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)

async function seed() {
  const studio = await prisma.studio.create({
    data: { name: "Test Studio", slug: `test-${Date.now()}`, whatsappEnabled: false },
  })
  const user = await prisma.user.create({
    data: { email: `t${Date.now()}@test.local`, password: "x", role: "TRAINER", studioId: studio.id },
  })
  const trainer = await prisma.trainer.create({
    data: { name: "Dita Test", userId: user.id, studioId: studio.id },
  })
  return { studio, user, trainer }
}

async function main() {
  const { studio, user, trainer } = await seed()
  const actor = { userId: user.id, name: trainer.name, role: "trainer" as const, trainerId: trainer.id }

  // ---------- CANCEL: 3 confirmed bookings, one membership-paid ----------
  const slot = await prisma.timeSlot.create({
    data: { date: tomorrow, startTime: "09:00", endTime: "11:00", trainerId: trainer.id, studioId: studio.id, maxCapacity: 6 },
  })
  const pass = await prisma.membership.create({
    data: { studioId: studio.id, clientPhone: "+7 916 035 4498", totalClasses: 5, remainingClasses: 3 },
  })
  const b1 = await prisma.booking.create({
    data: { slotId: slot.id, clientName: "Tatiana", clientEmail: "", clientPhone: "+7 916 035 4498", ticketCode: "111", paymentType: "MEMBERSHIP", membershipId: pass.id },
  })
  const b2 = await prisma.booking.create({
    data: { slotId: slot.id, clientName: "Ben", clientEmail: "", clientPhone: "+62 812 000 1111", ticketCode: "222" },
  })
  const b3 = await prisma.booking.create({
    data: { slotId: slot.id, clientName: "Ann", clientEmail: "", clientPhone: "+62 812 000 2222", ticketCode: "333", status: "CANCELLED" },
  })

  const r1 = await cancelClassSlot({ slotId: slot.id, studioId: studio.id, actor, reason: "sick" })
  assert(r1.ok, `cancel failed: ${JSON.stringify(r1)}`)
  assert.equal(r1.ok && r1.cancelledBookings, 2, "only the 2 CONFIRMED bookings are cancelled")

  const slotAfter = await prisma.timeSlot.findUnique({ where: { id: slot.id } })
  assert(slotAfter?.cancelledAt, "slot is tombstoned")
  assert.equal(slotAfter?.cancelledByUserId, user.id)
  assert.equal(slotAfter?.cancelReason, "sick")

  const b1After = await prisma.booking.findUnique({ where: { id: b1.id } })
  assert.equal(b1After?.status, "CANCELLED")
  assert.equal(b1After?.cancelledByRole, "trainer")
  assert.equal(b1After?.membershipId, null, "membership link cleared after restore")
  const passAfter = await prisma.membership.findUnique({ where: { id: pass.id } })
  assert.equal(passAfter?.remainingClasses, 4, "exactly one class returned")

  const b3After = await prisma.booking.findUnique({ where: { id: b3.id } })
  assert.equal(b3After?.cancelledByRole, null, "pre-cancelled booking untouched")

  // Double cancel → conflict, membership NOT restored again.
  const r2 = await cancelClassSlot({ slotId: slot.id, studioId: studio.id, actor, reason: "sick" })
  assert(!r2.ok && r2.status === 409, "second cancel is a 409")
  const passAfter2 = await prisma.membership.findUnique({ where: { id: pass.id } })
  assert.equal(passAfter2?.remainingClasses, 4, "no double restore")

  // Cancelled slot is invisible to the public availability filter.
  const publicSlots = await prisma.timeSlot.findMany({
    where: { studioId: studio.id, date: tomorrow, trainerId: { not: null }, publicVisible: true, cancelledAt: null },
  })
  assert.equal(publicSlots.length, 0, "tombstone hidden from public booking")

  // ---------- MOVE: 2 bookings onto an existing class with a ticket collision ----------
  const src = await prisma.timeSlot.create({
    data: { date: tomorrow, startTime: "13:00", endTime: "15:00", trainerId: trainer.id, studioId: studio.id, maxCapacity: 6 },
  })
  const dst = await prisma.timeSlot.create({
    data: { date: tomorrow, startTime: "17:00", endTime: "19:00", trainerId: trainer.id, studioId: studio.id, maxCapacity: 6 },
  })
  const m1 = await prisma.booking.create({
    data: { slotId: src.id, clientName: "Kim", clientEmail: "", clientPhone: "+62 813 111 2222", ticketCode: "444" },
  })
  const m2 = await prisma.booking.create({
    data: { slotId: src.id, clientName: "Lee", clientEmail: "", clientPhone: "+62 813 333 4444", ticketCode: "555" },
  })
  // Existing booking on the target with a COLLIDING ticket code.
  await prisma.booking.create({
    data: { slotId: dst.id, clientName: "Sam", clientEmail: "", clientPhone: "+62 813 555 6666", ticketCode: "444" },
  })

  const r3 = await moveClassSlot({
    slotId: src.id, studioId: studio.id, actor, reason: "emergency",
    target: { kind: "existing", slotId: dst.id },
  })
  assert(r3.ok, `move failed: ${JSON.stringify(r3)}`)
  assert.equal(r3.ok && r3.movedBookings, 2)

  const srcAfter = await prisma.timeSlot.findUnique({ where: { id: src.id } })
  assert(srcAfter?.cancelledAt, "source tombstoned")
  assert.equal(srcAfter?.movedToSlotId, dst.id, "tombstone points at the destination")

  const m1After = await prisma.booking.findUnique({ where: { id: m1.id } })
  const m2After = await prisma.booking.findUnique({ where: { id: m2.id } })
  assert.equal(m1After?.slotId, dst.id)
  assert.equal(m2After?.slotId, dst.id)
  assert.notEqual(m1After?.ticketCode, "444", "colliding ticket regenerated")
  assert.equal(m2After?.ticketCode, "555", "non-colliding ticket kept")
  const dstCodes = await prisma.booking.findMany({ where: { slotId: dst.id, status: "CONFIRMED" }, select: { ticketCode: true } })
  assert.equal(new Set(dstCodes.map((b) => b.ticketCode)).size, 3, "all codes unique on the destination")

  // ---------- MOVE onto a too-small class → 409, nothing changes ----------
  const src2 = await prisma.timeSlot.create({
    data: { date: tomorrow, startTime: "07:00", endTime: "09:00", trainerId: trainer.id, studioId: studio.id, maxCapacity: 6 },
  })
  await prisma.booking.create({
    data: { slotId: src2.id, clientName: "P1", clientEmail: "", clientPhone: "+62 813 777 0001", ticketCode: "601" },
  })
  await prisma.booking.create({
    data: { slotId: src2.id, clientName: "P2", clientEmail: "", clientPhone: "+62 813 777 0002", ticketCode: "602" },
  })
  const tiny = await prisma.timeSlot.create({
    data: { date: tomorrow, startTime: "19:30", endTime: "21:30", trainerId: trainer.id, studioId: studio.id, maxCapacity: 1 },
  })
  const r4 = await moveClassSlot({
    slotId: src2.id, studioId: studio.id, actor, reason: "other",
    target: { kind: "existing", slotId: tiny.id },
  })
  assert(!r4.ok && r4.status === 409, "capacity overflow rejected")
  const src2After = await prisma.timeSlot.findUnique({ where: { id: src2.id } })
  assert.equal(src2After?.cancelledAt, null, "source untouched after rejected move")

  // ---------- MOVE to a NEW date/time ----------
  const r5 = await moveClassSlot({
    slotId: src2.id, studioId: studio.id, actor, reason: "other",
    target: { kind: "new", date: tomorrow, startTime: "15:30", endTime: "17:30" },
  })
  assert(r5.ok, `move-to-new failed: ${JSON.stringify(r5)}`)
  const created = await prisma.timeSlot.findUnique({ where: { id: r5.ok ? r5.targetSlotId : "" } })
  assert.equal(created?.trainerId, trainer.id, "new slot keeps the trainer")
  const movedCount = await prisma.booking.count({ where: { slotId: created!.id, status: "CONFIRMED" } })
  assert.equal(movedCount, 2, "whole group landed on the new slot")

  console.log("ALL SCENARIOS PASSED ✅")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
