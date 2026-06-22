import webpush from "web-push"
import { prisma } from "@/lib/prisma"

// Web Push (PWA notifications) so the admin/trainer cabinet rings like WhatsApp
// on a phone with no native app. Keyed by VAPID; no-ops cleanly until the env
// keys are set. The PUBLIC key is also exposed to the client as
// NEXT_PUBLIC_VAPID_PUBLIC_KEY.

const PUBLIC = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ""
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@bookgravity.com"

let ready = false
function ensure(): boolean {
  if (ready) return true
  if (PUBLIC && PRIVATE) {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE)
    ready = true
    return true
  }
  return false
}

export function webPushConfigured(): boolean {
  return Boolean(PUBLIC && PRIVATE)
}

/** Send a push to every browser the user has subscribed. Stale subs (404/410)
 *  are pruned so the table self-cleans. */
export async function sendWebPush(args: {
  userId: string
  title: string
  body: string
  data?: Record<string, unknown>
}): Promise<void> {
  if (!ensure()) return
  const subs = await prisma.webPushSubscription.findMany({ where: { userId: args.userId } })
  if (subs.length === 0) return
  const payload = JSON.stringify({ title: args.title, body: args.body, data: args.data ?? {} })
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) {
          await prisma.webPushSubscription.deleteMany({ where: { endpoint: s.endpoint } }).catch(() => {})
        }
      }
    }),
  )
}
