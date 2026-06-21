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
// CANCELLED = client cancelled or never came. The trainer/admin cancel returns
// any membership class used and notifies the client. (A separate "no-show"
// state that burned the pass was removed - owner decision 21.06.2026.)
export const BOOKING_STATUSES = ["CONFIRMED", "CANCELLED"] as const

export const zBookingPaymentType = z.enum(BOOKING_PAYMENT_TYPES)
export const zPosPaymentMethod = z.enum(POS_PAYMENT_METHODS)
export const zPaymentStatus = z.enum(PAYMENT_STATUSES)
export const zBookingStatus = z.enum(BOOKING_STATUSES)

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
