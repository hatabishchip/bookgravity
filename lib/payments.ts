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
// NO_SHOW = client booked but never came. It drops out of the trainer's
// "collect payment" nag (which only looks at CONFIRMED) and, unlike CANCELLED,
// does NOT restore a membership class - a no-show burns the pass class.
export const BOOKING_STATUSES = ["CONFIRMED", "CANCELLED", "NO_SHOW"] as const

export const zBookingPaymentType = z.enum(BOOKING_PAYMENT_TYPES)
export const zPosPaymentMethod = z.enum(POS_PAYMENT_METHODS)
export const zPaymentStatus = z.enum(PAYMENT_STATUSES)
export const zBookingStatus = z.enum(BOOKING_STATUSES)
