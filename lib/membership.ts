import { prisma } from "@/lib/prisma"

// Memberships (абонементы) are keyed by the client's phone but phone strings
// aren't normalized in the DB (bookings store whatever the client typed, the
// sell form whatever the trainer typed). We match on the last 10 digits — the
// same heuristic the WhatsApp webhook uses — so "+62 812…", "0812…" and
// "62812…" all resolve to the same person.
export function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10)
}

// Sum of unused classes for a phone at a studio (0 if none / phone too short).
// Phones are stored with formatting (spaces), so we can't SQL-match a
// contiguous digit substring — we fetch the studio's active passes and compare
// by last-10-digits in memory instead. Studios have few rows, so this is cheap.
export async function getMembershipBalance(studioId: string, phone: string): Promise<number> {
  const tail = phoneTail(phone)
  if (tail.length < 6) return 0
  const rows = await prisma.membership.findMany({
    where: { studioId, remainingClasses: { gt: 0 } },
    select: { clientPhone: true, remainingClasses: true },
  })
  return rows
    .filter((r) => phoneTail(r.clientPhone) === tail)
    .reduce((s, r) => s + r.remainingClasses, 0)
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
    const rows = await tx.membership.findMany({
      where: { studioId, remainingClasses: { gt: 0 } },
      orderBy: { createdAt: "asc" },
    })
    const row = rows.find((r) => phoneTail(r.clientPhone) === tail)
    if (!row) return null
    await tx.membership.update({
      where: { id: row.id },
      data: { remainingClasses: { decrement: 1 } },
    })
    return row.id
  })
}

// Give a class back to a specific membership row — used when a trainer switches
// a booking away from MEMBERSHIP, or when a membership-paid booking is
// cancelled. Capped at totalClasses so repeated calls can't over-credit.
export async function restoreMembershipClass(membershipId: string): Promise<void> {
  try {
    const row = await prisma.membership.findUnique({ where: { id: membershipId } })
    if (!row) return
    if (row.remainingClasses >= row.totalClasses) return
    await prisma.membership.update({
      where: { id: membershipId },
      data: { remainingClasses: { increment: 1 } },
    })
  } catch {
    /* row gone — nothing to restore */
  }
}
