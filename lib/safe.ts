// Trainer cash-safe engine. A trainer keeps the CASH they collect in their own
// safe box; this module computes how much each box should hold.
//
// Single source of truth, no double entry:
//   balance = computed cash inflow (from payment records) + signed manual ops
// Inflow is DERIVED - never written as rows - so the number can't drift.
// Manual ops (lib model SafeOperation) only record what leaves or corrects the
// box: owner withdrawals, salary paid out of the safe, recount corrections.
//
// Attribution of an inflow ("whose box did the bills land in"):
//   1. Booking.paymentMarkedByUserId - whoever tapped "Paid - Cash" took the
//      money (recorded from 06.07.2026 onward).
//   2. History (or a non-trainer marker, e.g. an admin): fall back to the
//      slot's lead trainer - they ran the class and collected at the door.
//   3. Cash pass sales count only when sold BY a trainer (Membership.
//      soldByUserId): an admin-sold pass never sits in a trainer's box.
// Only physical "CASH" counts - EDC/QR/Transfer never touch the box.
import { prisma } from "@/lib/prisma"
import { priceForTier } from "@/lib/payments"

export type SafeBalance = {
  trainerId: string
  trainerName: string
  /** Derived cash inflow over all time (classes + passes + services). */
  cashIn: number
  /** Sum of manual operations (withdrawals/salary negative, corrections signed). */
  opsTotal: number
  /** What the physical box should hold right now. */
  balance: number
}

export async function isSafeEnabled(studioId: string): Promise<boolean> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { safeEnabled: true },
  })
  return !!studio?.safeEnabled
}

export async function computeSafeBalances(studioId: string): Promise<SafeBalance[]> {
  const [studio, trainers] = await Promise.all([
    prisma.studio.findUnique({
      where: { id: studioId },
      select: { localPrice: true, membershipClassPrice: true },
    }),
    prisma.trainer.findMany({
      where: { studioId, archived: false },
      select: { id: true, name: true, userId: true },
    }),
  ])
  const localPrice = studio?.localPrice ?? 200000
  const memberPrice = studio?.membershipClassPrice ?? 250000
  const trainerByUserId = new Map(trainers.map((t) => [t.userId, t.id]))

  const cashIn = new Map<string, number>()
  const add = (trainerId: string | null | undefined, amount: number) => {
    if (!trainerId) return
    cashIn.set(trainerId, (cashIn.get(trainerId) ?? 0) + amount)
  }
  /** Marker user's own safe when they are a trainer, else the slot's trainer. */
  const attribute = (markerUserId: string | null, slotTrainerId: string | null) =>
    (markerUserId && trainerByUserId.get(markerUserId)) || slotTrainerId

  // Cash-paid classes.
  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      paymentStatus: "PAID",
      paymentType: "CASH",
      slot: { studioId },
    },
    select: {
      priceTier: true,
      localResident: true,
      paymentMarkedByUserId: true,
      slot: { select: { price: true, trainerId: true } },
    },
  })
  for (const b of bookings) {
    add(
      attribute(b.paymentMarkedByUserId, b.slot.trainerId),
      priceForTier(b, { slotPrice: b.slot.price, memberPrice, localPrice }),
    )
  }

  // Cash pass sales by a trainer.
  const passes = await prisma.membership.findMany({
    where: { studioId, paymentType: "CASH" },
    select: { soldByUserId: true, classPrice: true, totalClasses: true },
  })
  for (const m of passes) {
    const trainerId = m.soldByUserId ? trainerByUserId.get(m.soldByUserId) : null
    add(trainerId, (m.classPrice ?? memberPrice) * m.totalClasses)
  }

  // Add-on services paid in cash separately from the class.
  const services = await prisma.bookingService.findMany({
    where: { paymentType: "CASH", booking: { status: "CONFIRMED", slot: { studioId } } },
    select: {
      service: { select: { price: true } },
      booking: {
        select: { paymentMarkedByUserId: true, slot: { select: { trainerId: true } } },
      },
    },
  })
  for (const s of services) {
    add(attribute(s.booking.paymentMarkedByUserId, s.booking.slot.trainerId), s.service.price)
  }

  // Manual operations (signed).
  const ops = await prisma.safeOperation.groupBy({
    by: ["trainerId"],
    where: { studioId },
    _sum: { amount: true },
  })
  const opsByTrainer = new Map(ops.map((o) => [o.trainerId, o._sum.amount ?? 0]))

  return trainers
    .map((t) => {
      const inflow = cashIn.get(t.id) ?? 0
      const opsTotal = opsByTrainer.get(t.id) ?? 0
      return {
        trainerId: t.id,
        trainerName: t.name,
        cashIn: inflow,
        opsTotal,
        balance: inflow + opsTotal,
      }
    })
    .sort((a, b) => b.balance - a.balance)
}
