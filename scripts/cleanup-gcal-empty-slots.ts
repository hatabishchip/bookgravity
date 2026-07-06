// One-shot: re-sync every FUTURE slot of Google-connected studios under the
// new rule (Sveta, 06.07): a Google Calendar event exists only while the class
// has at least one CONFIRMED booking. Existing events for empty slots get
// deleted; booked classes keep/update theirs. Idempotent - safe to re-run.
//
// Run: npx tsx scripts/cleanup-gcal-empty-slots.ts
import "dotenv/config"
import { prisma } from "../lib/prisma"
import { syncSlotToGoogle } from "../lib/google-calendar"

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const studios = await prisma.studio.findMany({
    where: { googleRefreshToken: { not: null } },
    select: { id: true, slug: true },
  })
  for (const s of studios) {
    const slots = await prisma.timeSlot.findMany({
      where: { studioId: s.id, date: { gte: today } },
      select: {
        id: true, date: true, startTime: true, googleEventId: true, cancelledAt: true,
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    })
    let removed = 0, kept = 0, skipped = 0
    for (const slot of slots) {
      const empty = !!slot.cancelledAt || slot._count.bookings === 0
      if (empty && !slot.googleEventId) { skipped++; continue } // nothing to remove
      await syncSlotToGoogle(slot.id)
      if (empty) removed++
      else kept++
      // Be gentle with the Calendar API quota.
      await new Promise((r) => setTimeout(r, 150))
    }
    console.log(`${s.slug}: events removed=${removed} kept/updated=${kept} already-clean=${skipped} (of ${slots.length} future slots)`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
