// Studio cash-drawer ("касса") reconciliation math, shared by the Cash Flow
// report and the recount endpoint so both agree to the rupiah.
//
// Only physical CASH counts toward the drawer - card / QRIS / transfer never
// touch it. "Expected in drawer" = all-time cash-in − cash-out − Σ(recount
// differences), so right after a physical recount it equals what was counted
// (past differences absorb bank deposits, owner cash-outs and pre-launch test
// rows). Comparing expected to the physical count is Sveta's control function.
import { prisma } from "@/lib/prisma"
import { priceForTier } from "@/lib/payments"

/** All-time net cash the records say entered the drawer (in − out). */
export async function cashNetAllTime(studioId: string): Promise<{
  cashIn: number
  cashExpenses: number
  cashPayouts: number
  net: number
}> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { localPrice: true, membershipClassPrice: true },
  })
  const localPrice = studio?.localPrice ?? 200000
  const memberPrice = studio?.membershipClassPrice ?? 250000

  const [bookings, passes, services, exp, pay] = await Promise.all([
    prisma.booking.findMany({
      where: { status: "CONFIRMED", paymentStatus: "PAID", paymentType: "CASH", slot: { studioId } },
      select: { priceTier: true, localResident: true, slot: { select: { price: true } } },
    }),
    prisma.membership.findMany({
      where: { studioId, paymentType: "CASH" },
      select: { classPrice: true, totalClasses: true },
    }),
    prisma.bookingService.findMany({
      where: { paymentType: "CASH", booking: { status: "CONFIRMED", slot: { studioId } } },
      select: { service: { select: { price: true } } },
    }),
    prisma.expense.aggregate({ where: { studioId, method: "CASH" }, _sum: { amount: true } }),
    prisma.trainerPayment.aggregate({ where: { studioId, method: "CASH", kind: { not: "accrual" } }, _sum: { amount: true } }),
  ])

  const cashInBookings = bookings.reduce(
    (s, b) => s + priceForTier(b, { slotPrice: b.slot.price, memberPrice, localPrice }),
    0,
  )
  const cashInPasses = passes.reduce((s, m) => s + (m.classPrice ?? memberPrice) * m.totalClasses, 0)
  const cashInServices = services.reduce((s, sv) => s + sv.service.price, 0)
  const cashIn = cashInBookings + cashInPasses + cashInServices
  const cashExpenses = exp._sum.amount ?? 0
  const cashPayouts = pay._sum.amount ?? 0
  return { cashIn, cashExpenses, cashPayouts, net: cashIn - cashExpenses - cashPayouts }
}

/** What the drawer should physically hold right now (control figure). */
export async function expectedInDrawer(studioId: string): Promise<number> {
  const [{ net }, agg] = await Promise.all([
    cashNetAllTime(studioId),
    prisma.cashCount.aggregate({ where: { studioId }, _sum: { difference: true } }),
  ])
  return net - (agg._sum.difference ?? 0)
}
