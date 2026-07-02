import { priceForTier } from "@/lib/payments"

// Single source of truth for trainer commission math, shared by the admin and
// trainer salary endpoints (they had a ~100-line copy each — a change to the
// rule in one silently diverged the money the two screens showed). Extracted
// 2026-07-02 audit.
//
// Rule: flat 20% commission, no fixed base salary. When a slot has an assistant,
// the assistant earns ASSISTANT_RATE (5%) and the lead's share drops by that
// much (to 15%) for that slot.
//
// NOTE (2026-07-02): Trainer.commissionRate exists in the schema + admin UI but
// is deliberately NOT used here yet — wiring it would change one account's
// payout (see audit memo). Kept as the hardcoded FLAT_RATE until the owner
// decides the field's fate. This keeps behaviour identical to before the
// extraction.
export const FLAT_RATE = 20
export const ASSISTANT_RATE = 5

export type SalaryRow = {
  bookingId: string
  date: string
  startTime: string
  classType: string
  client: string
  paymentType: string
  tier: string | null
  amount: number
  rate: number
  commission: number
  role: "lead" | "assistant"
}

type SalaryBooking = {
  id: string
  clientName: string
  paymentType: string
  priceTier?: string | null
  localResident: boolean
}
export type SalarySlot = {
  date: string
  startTime: string
  classType: string
  price: number
  assistant?: { id: string } | null
  bookings: SalaryBooking[]
}

export type SalaryComputation = {
  breakdown: SalaryRow[]
  mainCommission: number
  assistantCommission: number
  commission: number
  totalPaid: number
  paidBookingsCount: number
  sessionsWorked: number // lead slots that had >=1 paid booking
  assistedCount: number // assisted slots that had >=1 paid booking
}

/**
 * Compute one commission row per paid booking (so totals reconcile with the
 * visible list) for a trainer, given the slots they LEAD and the slots they
 * ASSIST, plus the studio's tier prices. Rows are sorted newest class first.
 */
export function computeSalary(opts: {
  leadSlots: SalarySlot[]
  assistedSlots: SalarySlot[]
  prices: { memberPrice: number; localPrice: number }
}): SalaryComputation {
  const { leadSlots, assistedSlots, prices } = opts
  const amountOf = (b: SalaryBooking, slotPrice: number) =>
    priceForTier(b, { slotPrice, memberPrice: prices.memberPrice, localPrice: prices.localPrice })

  const breakdown: SalaryRow[] = []
  let mainCommission = 0
  let totalPaid = 0
  let paidBookingsCount = 0
  let sessionsWorked = 0

  for (const slot of leadSlots) {
    const effectiveRate = slot.assistant ? FLAT_RATE - ASSISTANT_RATE : FLAT_RATE
    for (const b of slot.bookings) {
      const amount = amountOf(b, slot.price)
      const commission = Math.round((amount * effectiveRate) / 100)
      mainCommission += commission
      totalPaid += amount
      breakdown.push({
        bookingId: b.id, date: slot.date, startTime: slot.startTime, classType: slot.classType,
        client: b.clientName, paymentType: b.paymentType, tier: b.priceTier ?? null,
        amount, rate: effectiveRate, commission, role: "lead",
      })
    }
    paidBookingsCount += slot.bookings.length
    if (slot.bookings.length > 0) sessionsWorked++
  }

  let assistantCommission = 0
  let assistedCount = 0
  for (const slot of assistedSlots) {
    for (const b of slot.bookings) {
      const amount = amountOf(b, slot.price)
      const commission = Math.round((amount * ASSISTANT_RATE) / 100)
      assistantCommission += commission
      breakdown.push({
        bookingId: b.id, date: slot.date, startTime: slot.startTime, classType: slot.classType,
        client: b.clientName, paymentType: b.paymentType, tier: b.priceTier ?? null,
        amount, rate: ASSISTANT_RATE, commission, role: "assistant",
      })
    }
    if (slot.bookings.length > 0) assistedCount++
  }

  breakdown.sort((a, b) =>
    a.date === b.date ? b.startTime.localeCompare(a.startTime) : b.date.localeCompare(a.date),
  )

  return {
    breakdown,
    mainCommission,
    assistantCommission,
    commission: mainCommission + assistantCommission,
    totalPaid,
    paidBookingsCount,
    sessionsWorked,
    assistedCount,
  }
}
