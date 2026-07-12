import { prisma } from "@/lib/prisma"
import { restoreMembershipClass } from "@/lib/membership"

// Shared payment-switch rules for booking PATCH endpoints (admin + trainer).
// Lived only in the trainer route before 2026-06-11, so an admin couldn't
// mark a class as membership-paid at all.
//
//  - switching TO "MEMBERSHIP" (and not already on it) charges one class from
//    the client's oldest active pass; no balance -> error.
//  - switching AWAY from a membership-paid booking gives the class back.
//
// Atomicity (audit 2026-07-02): the deduct + claiming that class on the booking
// row now happen in ONE transaction, guarded by a re-read of the booking's
// membershipId inside the tx. This closes the race where two concurrent PATCHes
// both saw membershipId == null and charged two classes, and the case where the
// booking.update failed after a successful deduct (class charged, nothing points
// at it -> unrestorable).

export type PaymentSwitchResult =
  | { ok: true; updateData: Record<string, unknown> }
  | { ok: false; error: "no_membership_balance" }

export async function applyPaymentSwitch(opts: {
  studioId: string
  bookingId: string
  clientPhone: string
  currentMembershipId: string | null
  newPaymentType: string
  /** Tier the caller explicitly set on this request (keep it if present). */
  requestedPriceTier?: string | null
  /** paymentStatus the caller explicitly set on this request. */
  requestedPaymentStatus?: string
}): Promise<PaymentSwitchResult> {
  const { newPaymentType } = opts

  // --- switching TO membership ---
  if (newPaymentType === "MEMBERSHIP" && opts.currentMembershipId == null) {
    const tail = opts.clientPhone.replace(/\D/g, "").slice(-10)
    if (tail.length < 6) return { ok: false, error: "no_membership_balance" }

    const usedId = await prisma.$transaction(async (tx) => {
      // Re-read inside the tx. If another writer already claimed a pass for this
      // booking (concurrent switch) reflect that id without charging again; a
      // cancelled booking must never be charged.
      const b = await tx.booking.findUnique({
        where: { id: opts.bookingId },
        select: { membershipId: true, status: true },
      })
      if (!b || b.status === "CANCELLED") return null
      if (b.membershipId != null) return b.membershipId

      const row = await tx.membership.findFirst({
        where: { studioId: opts.studioId, remainingClasses: { gt: 0 }, clientPhone: { endsWith: tail } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      })
      if (!row) return null
      // Conditional decrement — never drive remainingClasses below 0.
      const dec = await tx.membership.updateMany({
        where: { id: row.id, remainingClasses: { gt: 0 } },
        data: { remainingClasses: { decrement: 1 } },
      })
      if (dec.count === 0) return null
      await tx.booking.update({ where: { id: opts.bookingId }, data: { membershipId: row.id } })
      return row.id
    })

    if (!usedId) {
      // No pass in the system - a paper Member card sold before the app, or a
      // balance that ran out. Owner decision 10.07: the Member-card payment is
      // STILL recorded (PAID, member tariff, zero cash - the money entered the
      // books when the card was sold); the punch card on paper stays the
      // source of truth for the remaining visits. membershipId stays null so
      // nothing is ever decremented or restored for this booking.
      return {
        ok: true,
        updateData: {
          membershipId: null,
          paymentStatus: "PAID",
          priceTier: opts.requestedPriceTier ?? "MEMBER",
          localResident: opts.requestedPriceTier ? opts.requestedPriceTier === "LOCAL" : false,
        },
      }
    }
    return {
      ok: true,
      updateData: {
        membershipId: usedId,
        paymentStatus: "PAID",
        // Commission base = member price (250k), not the 300k drop-in - unless
        // the caller explicitly chose a different tier on this request.
        priceTier: opts.requestedPriceTier ?? "MEMBER",
        localResident: opts.requestedPriceTier ? opts.requestedPriceTier === "LOCAL" : false,
      },
    }
  }

  // --- switching AWAY from a membership-paid booking ---
  if (newPaymentType !== "MEMBERSHIP" && opts.currentMembershipId != null) {
    await restoreMembershipClass(opts.currentMembershipId)
    return {
      ok: true,
      updateData: {
        membershipId: null,
        // Leaving membership without an explicit status -> unpaid, so a stale
        // "PAID" can't be counted in salary/cashflow with no money recorded.
        ...(opts.requestedPaymentStatus ? {} : { paymentStatus: "UNPAID" }),
      },
    }
  }

  return { ok: true, updateData: {} }
}

// Keep add-on service payment methods honest when the CLASS payment changes
// (audit 12.07: services picked at online booking sat with paymentType null
// forever - Cash Flow and the safes skip null, so Olivia's cash 300k class +
// 50k lifting reported as 300k; meanwhile staff-toggled services hardcoded
// CASH even when the client paid everything in one QR).
//
//  - Class recorded with a POS method (CASH/EDC/QR/TRANSFER): every service
//    of this booking that has NO method yet inherits the class's method -
//    one payment, one method, full amount counted.
//  - Class un-recorded (PENDING): all service methods reset to null -
//    "not paid" must not leave money attributed anywhere.
//  - MEMBERSHIP: untouched - the pass never covers add-ons; the staff UI
//    asks how each extra was paid (defaults to CASH on add).
// Call AFTER the booking row update succeeds.
export async function syncServicePaymentsWithClass(bookingId: string, newPaymentType: string) {
  if (newPaymentType === "PENDING") {
    await prisma.bookingService.updateMany({
      where: { bookingId },
      data: { paymentType: null },
    })
    return
  }
  if (["CASH", "EDC", "QR", "TRANSFER"].includes(newPaymentType)) {
    await prisma.bookingService.updateMany({
      where: { bookingId, paymentType: null },
      data: { paymentType: newPaymentType },
    })
  }
}

/**
 * Default method for a service ADDED BY STAFF (admin/trainer toggle), given
 * the booking's current payment state:
 *  - class already paid with a POS method -> inherit it (they'll settle the
 *    add-on the same way they settled the class);
 *  - class on MEMBERSHIP -> "CASH" (pass doesn't cover add-ons; UI lets the
 *    coach switch it);
 *  - class not paid yet -> null; syncServicePaymentsWithClass fills it in
 *    the moment the class payment is recorded.
 */
export function defaultServiceMethod(booking: { paymentStatus: string; paymentType: string }): string | null {
  if (booking.paymentType === "MEMBERSHIP") return "CASH"
  if (booking.paymentStatus === "PAID" && ["CASH", "EDC", "QR", "TRANSFER"].includes(booking.paymentType)) {
    return booking.paymentType
  }
  return null
}
