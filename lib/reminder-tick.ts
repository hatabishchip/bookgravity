import { prisma } from "@/lib/prisma"
import { runTodayReminders } from "@/lib/today-reminders"
import { elogError } from "@/lib/elog"

// Traffic-driven fallback for the same-day reminder job.
//
// WHY: Vercel Hobby cron runs once a day, and GitHub's */20 scheduler can lag
// 1.5–5 HOURS under load (observed 2026-06-11) — long enough to miss the
// whole 135-min send window of a 7:00 morning class. Real site traffic is a
// scheduler that never throttles: every hit to the public slots API gives the
// job one cheap chance to run.
//
// SAFETY: a CronTick row is claimed atomically (updateMany guarded on
// lastRunAt) so at most one tick fires per MIN_GAP regardless of how many
// requests land at once, and the per-booking todayReminderSentAt claim inside
// runTodayReminders makes double-sends impossible even if two ticks raced.
// Errors never propagate — the public API that hosts the tick must not care.

const TICK_ID = "today-reminders"
const MIN_GAP_MS = 10 * 60 * 1000 // at most one traffic tick per 10 minutes

export async function maybeRunTodayReminders(): Promise<void> {
  try {
    const threshold = new Date(Date.now() - MIN_GAP_MS)
    // Claim: flip lastRunAt forward only if the previous run is old enough.
    const claimed = await prisma.cronTick.updateMany({
      where: { id: TICK_ID, lastRunAt: { lt: threshold } },
      data: { lastRunAt: new Date() },
    })
    if (claimed.count === 0) {
      // Row may simply not exist yet (first ever tick) — create and run.
      const existing = await prisma.cronTick.findUnique({ where: { id: TICK_ID } })
      if (existing) return // recent tick already covered this window
      await prisma.cronTick.create({ data: { id: TICK_ID, lastRunAt: new Date() } })
    }
    await runTodayReminders("traffic-tick")
  } catch (err) {
    console.error("[reminder-tick] failed:", err)
    await elogError("reminders:tick", "traffic tick crashed", { error: String(err) })
  }
}
