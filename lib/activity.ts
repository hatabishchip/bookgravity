import { prisma } from "@/lib/prisma"
import { deviceLabelFromUA } from "@/lib/device-label"

// Login records activity only at sign-in time, but a valid JWT session lasts
// ~30 days — so the admin "last active" view goes stale even while staff use
// the app daily (they never re-authenticate). This refreshes the signed-in
// user's LoginSession.lastSeenAt from a frequently-hit authenticated endpoint
// (e.g. the trainer schedule, which polls every 20s) so "last active" reflects
// real usage, not the last password login.
//
// Throttled: only writes when the existing row is older than 5 minutes, so the
// 20s poll doesn't hammer the DB. Best-effort — never throws into the caller.
const THROTTLE_MS = 5 * 60 * 1000

export async function touchLoginActivity(
  userId: string,
  ua: string | null | undefined,
): Promise<void> {
  try {
    const device = deviceLabelFromUA(ua)
    const now = new Date()
    const existing = await prisma.loginSession.findUnique({
      where: { userId_device: { userId, device } },
      select: { lastSeenAt: true },
    })
    if (!existing) {
      // First time we see this user on this device without a login row (e.g.
      // long-lived session) — create one so they show up as active.
      await prisma.loginSession.create({
        data: { userId, device, userAgent: ua ?? undefined },
      })
      return
    }
    if (now.getTime() - existing.lastSeenAt.getTime() > THROTTLE_MS) {
      await prisma.loginSession.update({
        where: { userId_device: { userId, device } },
        data: { lastSeenAt: now, userAgent: ua ?? undefined },
      })
    }
  } catch (err) {
    console.warn("[activity] touchLoginActivity failed:", err)
  }
}
