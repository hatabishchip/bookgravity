import { z } from "zod"

// Single source of truth for booking payment values. Before 2026-06-11 every
// endpoint declared its own enum and they drifted: admin accepted
// ONLINE/OFFLINE/PENDING, trainer CASH/EDC/QR/TRANSFER/PENDING/MEMBERSHIP,
// memberships a third subset — so an admin couldn't mark a membership
// payment and a trainer couldn't see admin-set types. DB column is a plain
// string (SQLite), so these arrays + Zod schemas ARE the validation layer.

/** Point-of-sale money methods (cash drawer reality at the studio). */
export const POS_PAYMENT_METHODS = ["CASH", "EDC", "QR", "TRANSFER"] as const

/**
 * Everything a Booking.paymentType may hold:
 *  - POS methods (set by trainer/admin when the client pays at the studio)
 *  - MEMBERSHIP (class charged to a pass; pairs with booking.membershipId)
 *  - PENDING (not paid yet — the default for fresh bookings)
 *  - ONLINE / OFFLINE (legacy admin values, still present on old rows)
 */
export const BOOKING_PAYMENT_TYPES = [
  ...POS_PAYMENT_METHODS,
  "MEMBERSHIP",
  "PENDING",
  "ONLINE",
  "OFFLINE",
] as const

export const PAYMENT_STATUSES = ["PAID", "UNPAID"] as const

// How long a trainer may still change/clear THEIR OWN payment record on THEIR
// OWN class after tapping it (Seni 10.07: marked a no-show client as paid by
// Member card and had no way back). Matches the "available for 30 minutes"
// affordance already shown on the collapsed card. After the window, Sveta's
// 06.07 rule stands: recorded payments are corrected by an admin only.
export const PAYMENT_EDIT_WINDOW_MS = 30 * 60 * 1000

// CANCELLED = client cancelled or never came. The trainer/admin cancel returns
// any membership class used and notifies the client. (A separate "no-show"
// state that burned the pass was removed - owner decision 21.06.2026.)
export const BOOKING_STATUSES = ["CONFIRMED", "CANCELLED"] as const

export const zBookingPaymentType = z.enum(BOOKING_PAYMENT_TYPES)
export const zPosPaymentMethod = z.enum(POS_PAYMENT_METHODS)
export const zPaymentStatus = z.enum(PAYMENT_STATUSES)
export const zBookingStatus = z.enum(BOOKING_STATUSES)

// Price tier the coach marks per booking — drives the base the 20% trainer
// commission (and cash-flow revenue) is computed from. Three tiers:
//   FULL   → the slot's full group price (e.g. 300k)
//   MEMBER → studio.membershipClassPrice (e.g. 250k) — client on a subscription
//   LOCAL  → studio.localPrice (e.g. 200k) — Indonesian local resident
export const PRICE_TIERS = ["FULL", "MEMBER", "LOCAL"] as const
export const zPriceTier = z.enum(PRICE_TIERS)
export type PriceTier = (typeof PRICE_TIERS)[number]
export const PRICE_TIER_LABEL: Record<string, string> = {
  FULL: "Full",
  MEMBER: "Membership",
  LOCAL: "Local",
}

/**
 * The price a booking counts for, given its tier. `null` tier = a legacy
 * booking made before tiers existed, so we honour the old localResident flag.
 */
export function priceForTier(
  booking: { priceTier?: string | null; localResident?: boolean | null },
  prices: { slotPrice: number; memberPrice: number; localPrice: number },
): number {
  switch (booking.priceTier) {
    case "MEMBER":
      return prices.memberPrice
    case "LOCAL":
      return prices.localPrice
    case "FULL":
      return prices.slotPrice
    default:
      return booking.localResident ? prices.localPrice : prices.slotPrice
  }
}

// Human labels for the salary breakdown (and anywhere a paid booking is shown).
export const PAYMENT_TYPE_LABEL: Record<string, string> = {
  CASH: "Cash",
  EDC: "Card (EDC)",
  QR: "QR",
  TRANSFER: "Transfer",
  MEMBERSHIP: "Membership",
  ONLINE: "Online",
  OFFLINE: "Offline",
  PENDING: "Pending",
}
export const paymentTypeLabel = (t: string) => PAYMENT_TYPE_LABEL[t] ?? t
export const classTypeLabel = (t: string) =>
  t === "PRIVATE" ? "Private" : t === "KIDS" ? "Kids" : t === "GROUP" ? "Group" : t
