import { prisma } from "@/lib/prisma"

// Memberships (абонементы) are keyed by the client's phone. Since the
// 2026-06-12 normalization phones are stored digits-only, so the last-10-digit
// match runs as an indexed SQL endsWith instead of the old fetch-all-and-
// filter-in-memory scan. phoneTail() stays the shared canonical-tail helper.
export function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10)
}

// Sum of unused classes for a phone at a studio (0 if none / phone too short).
export async function getMembershipBalance(studioId: string, phone: string): Promise<number> {
  const tail = phoneTail(phone)
  if (tail.length < 6) return 0
  const rows = await prisma.membership.findMany({
    where: { studioId, remainingClasses: { gt: 0 }, clientPhone: { endsWith: tail } },
    select: { remainingClasses: true },
  })
  return rows.reduce((s, r) => s + r.remainingClasses, 0)
}

// Build a tail -> remaining-balance map for a studio in one query. Used by the
// trainer roster so each booking card can show the client's balance without N
// round-trips.
export async function getStudioMembershipBalances(studioId: string): Promise<Map<string, number>> {
  const rows = await prisma.membership.findMany({
    where: { studioId, remainingClasses: { gt: 0 } },
    select: { clientPhone: true, remainingClasses: true },
  })
  const map = new Map<string, number>()
  for (const r of rows) {
    const t = phoneTail(r.clientPhone)
    if (t.length < 6) continue
    map.set(t, (map.get(t) ?? 0) + r.remainingClasses)
  }
  return map
}

// Deduct one class from the OLDEST active membership row for this phone.
// Atomic. Returns the membership id we charged, or null if there's no balance.
export async function deductMembershipClass(studioId: string, phone: string): Promise<string | null> {
  const tail = phoneTail(phone)
  if (tail.length < 6) return null
  return prisma.$transaction(async (tx) => {
    const row = await tx.membership.findFirst({
      where: { studioId, remainingClasses: { gt: 0 }, clientPhone: { endsWith: tail } },
      orderBy: { createdAt: "asc" },
    })
    if (!row) return null
    // Conditional decrement guards against ever going below 0 (defensive: the
    // findFirst already filtered gt:0, but a money counter should never trust it).
    const dec = await tx.membership.updateMany({
      where: { id: row.id, remainingClasses: { gt: 0 } },
      data: { remainingClasses: { decrement: 1 } },
    })
    if (dec.count === 0) return null
    return row.id
  })
}

// Give a class back to a specific membership row — used when a trainer switches
// a booking away from MEMBERSHIP, or when a membership-paid booking is
// cancelled. Capped at totalClasses so repeated calls can't over-credit.
export async function restoreMembershipClass(membershipId: string): Promise<void> {
  try {
    // Read + guard + increment in ONE transaction: two concurrent restores
    // (double webhook + admin) serialize on the writer, so the second sees the
    // committed bump and the cap holds - remainingClasses can't exceed total.
    await prisma.$transaction(async (tx) => {
      const row = await tx.membership.findUnique({
        where: { id: membershipId },
        select: { remainingClasses: true, totalClasses: true },
      })
      if (!row || row.remainingClasses >= row.totalClasses) return
      await tx.membership.update({
        where: { id: membershipId },
        data: { remainingClasses: { increment: 1 } },
      })
    })
  } catch {
    /* row gone — nothing to restore */
  }
}
