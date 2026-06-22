// Expo Push API client. Sends notifications through Expo's relay, which in
// turn forwards to APNS (iOS) and FCM (Android). Free, no credentials needed
// beyond the Expo push tokens our clients register.
//
// Usage:
//   await sendPush({ userId: "abc", title: "New booking", body: "..." })
//
// All sends are best-effort: failures are logged to console but never thrown.
// The caller (e.g. the booking POST handler) keeps running so the user
// flow isn't broken by a flaky push gateway.

import { prisma } from "@/lib/prisma"

type ChatNotifMode = "SOUND_VIBRATION" | "VIBRATION_ONLY" | "SOUND_ONLY"

type Payload = {
  title: string
  body: string
  data?: Record<string, unknown>
  // iOS / Android category — the app uses this to deep-link on tap.
  // e.g. category: "booking" → tap opens the trainer's class screen.
  category?: string
  // Override sound/vibration behaviour for this notification. When omitted,
  // defaults to SOUND_VIBRATION. Used for chat messages so each user hears
  // what their Profile "Notifications" setting says.
  chatNotifMode?: ChatNotifMode
}

type Recipient = { userId: string } | { expoPushTokens: string[] }

const ENDPOINT = "https://exp.host/--/api/v2/push/send"

// Maps a user's chatNotifMode to Expo push fields.
function notifModeToFields(mode: ChatNotifMode): { sound: "default" | null; channelId: string } {
  switch (mode) {
    case "VIBRATION_ONLY": return { sound: null, channelId: "chat_vibration" }
    case "SOUND_ONLY":     return { sound: "default", channelId: "chat_sound" }
    default:               return { sound: "default", channelId: "chat_sound_vibration" }
  }
}

export async function sendPush(args: Recipient & Payload): Promise<void> {
  const tokens = await resolveTokens(args)
  if (tokens.length === 0) return

  const { sound, channelId } = notifModeToFields(args.chatNotifMode ?? "SOUND_VIBRATION")

  // Expo accepts an array of message objects (one per recipient). Chunk
  // by 100 to stay under the documented batch limit.
  const messages = tokens.map((to) => ({
    to,
    title: args.title,
    body: args.body,
    data: args.data ?? {},
    categoryId: args.category,
    sound,
    // channelId selects the Android notification channel (sound + vibration
    // config). The mobile app registers all three channels at startup.
    channelId,
  }))

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100)
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.warn("[expo-push] non-200:", res.status, json)
        continue
      }
      // Look at receipt tickets: tokens that come back as "DeviceNotRegistered"
      // mean the user uninstalled — drop them so we don't keep retrying.
      const data = (json as { data?: Array<{ status: string; details?: { error?: string }; message?: string }> }).data
      if (Array.isArray(data)) {
        const stale: string[] = []
        data.forEach((ticket, idx) => {
          if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
            stale.push(batch[idx].to)
          }
        })
        if (stale.length > 0) {
          await prisma.nativePushToken.deleteMany({ where: { expoPushToken: { in: stale } } })
          console.log("[expo-push] dropped", stale.length, "stale tokens")
        }
      }
    } catch (err) {
      console.warn("[expo-push] send failed:", err)
    }
  }
}

async function resolveTokens(args: Recipient): Promise<string[]> {
  if ("expoPushTokens" in args) return args.expoPushTokens
  const rows = await prisma.nativePushToken.findMany({
    where: { userId: args.userId },
    select: { expoPushToken: true },
  })
  return rows.map((r) => r.expoPushToken)
}
