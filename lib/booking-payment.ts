import { deductMembershipClass, restoreMembershipClass } from "@/lib/membership"

// Shared payment-switch rules for booking PATCH endpoints (admin + trainer).
// Lived only in the trainer route before 2026-06-11, so an admin couldn't
// mark a class as membership-paid at all.
//
//  - switching TO "MEMBERSHIP" (and not already on it) charges one class from
//    the client's oldest active pass; no balance → error.
//  - switching AWAY from a membership-paid booking gives the class back.

export type PaymentSwitchResult =
  | { ok: true; updateData: Record<string, unknown> }
  | { ok: false; error: "no_membership_balance" }

export async function applyPaymentSwitch(opts: {
  studioId: string
  clientPhone: string
  currentMembershipId: string | null
  newPaymentType: string
}): Promise<PaymentSwitchResult> {
  const updateData: Record<string, unknown> = {}
  if (opts.newPaymentType === "MEMBERSHIP" && opts.currentMembershipId == null) {
    const usedId = await deductMembershipClass(opts.studioId, opts.clientPhone)
    if (!usedId) return { ok: false, error: "no_membership_balance" }
    updateData.membershipId = usedId
    updateData.paymentStatus = "PAID"
  } else if (opts.newPaymentType !== "MEMBERSHIP" && opts.currentMembershipId != null) {
    // Undo a previous membership deduction.
    await restoreMembershipClass(opts.currentMembershipId)
    updateData.membershipId = null
  }
  return { ok: true, updateData }
}
