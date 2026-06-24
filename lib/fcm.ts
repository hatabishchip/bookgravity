// Direct Firebase Cloud Messaging (HTTP v1) sender for Android chat pushes.
//
// Why not just use the Expo relay (lib/expo-push.ts)? Expo's push API does not
// expose Android's `collapse_key` / notification `tag`, so every WhatsApp
// message becomes a separate tray notification. Android launchers render the
// app-icon badge as the number of tray notifications, so 8 messages in one chat
// read as "8" on the icon while the inbox correctly counts "1" conversation.
//
// Sending through FCM directly lets us set, per message:
//   - android.collapse_key = conversationId  → only the latest delivered
//   - android.notification.tag = conversationId  → replaces the prior one
//   - android.notification.notification_count = unread-conversation count
// so each chat keeps exactly one notification and the icon badge equals the
// number of unread chats. iOS keeps going through Expo/APNs.
//
// Auth: a Firebase service-account key (project bookgravity-f035f) is stored in
// the FIREBASE_SERVICE_ACCOUNT env var (base64-encoded JSON). We mint a short
// OAuth2 access token from it with the node crypto module - no extra deps.
//
// All sends are best-effort: failures are logged, never thrown.

import crypto from "crypto"
import { prisma } from "@/lib/prisma"

type ServiceAccount = { client_email: string; private_key: string; project_id: string }

type FcmPayload = {
  title: string
  body: string
  data?: Record<string, unknown>
  category?: string
  channelId: string
  sound: boolean
  badge?: number
  collapseKey?: string
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    // Stored base64-encoded to survive env-var newline mangling; fall back to
    // raw JSON in case it was pasted directly.
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")
    const sa = JSON.parse(json) as ServiceAccount
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null
    return sa
  } catch (err) {
    console.warn("[fcm] could not parse FIREBASE_SERVICE_ACCOUNT:", err)
    return null
  }
}

export function isFcmConfigured(): boolean {
  return loadServiceAccount() !== null
}

// Cache the OAuth access token across warm serverless invocations.
const tokenCache = globalThis as unknown as { __fcmToken?: { token: string; exp: number } }

async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  if (tokenCache.__fcmToken && tokenCache.__fcmToken.exp - 60 > now) {
    return tokenCache.__fcmToken.token
  }
  try {
    const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url")
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
    const claims = b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    )
    const signingInput = `${header}.${claims}`
    const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(sa.private_key)
    const jwt = `${signingInput}.${b64url(signature)}`

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number }
    if (!res.ok || !json.access_token) {
      console.warn("[fcm] token mint failed:", res.status, json)
      return null
    }
    tokenCache.__fcmToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) }
    return json.access_token
  } catch (err) {
    console.warn("[fcm] token mint error:", err)
    return null
  }
}

// Send one chat notification to each Android FCM token. Returns nothing; stale
// tokens are pruned from the DB so we stop sending to uninstalled apps.
export async function sendFcm(tokens: string[], payload: FcmPayload): Promise<void> {
  if (tokens.length === 0) return
  const sa = loadServiceAccount()
  if (!sa) return
  const accessToken = await getAccessToken(sa)
  if (!accessToken) return

  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  // FCM data values must all be strings.
  const data: Record<string, string> = {}
  for (const [k, v] of Object.entries(payload.data ?? {})) data[k] = String(v)
  if (payload.category) data.category = payload.category

  const androidNotification: Record<string, unknown> = {
    channel_id: payload.channelId,
    ...(payload.collapseKey ? { tag: payload.collapseKey } : {}),
    ...(payload.badge !== undefined ? { notification_count: payload.badge } : {}),
    ...(payload.sound ? { sound: "default" } : {}),
  }

  const stale: string[] = []
  await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: payload.title, body: payload.body },
              data,
              android: {
                priority: "high",
                ...(payload.collapseKey ? { collapse_key: payload.collapseKey } : {}),
                notification: androidNotification,
              },
            },
          }),
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: { status?: string; details?: Array<{ errorCode?: string }> }
          }
          const code =
            err.error?.status ?? err.error?.details?.find((d) => d.errorCode)?.errorCode ?? ""
          // Token no longer valid → the app was uninstalled or the token rotated.
          if (code === "UNREGISTERED" || code === "NOT_FOUND" || res.status === 404) {
            stale.push(token)
          } else {
            console.warn("[fcm] send non-200:", res.status, code)
          }
        }
      } catch (err) {
        console.warn("[fcm] send failed:", err)
      }
    }),
  )

  if (stale.length > 0) {
    await prisma.nativePushToken
      .updateMany({ where: { fcmToken: { in: stale } }, data: { fcmToken: null } })
      .catch(() => {})
    console.log("[fcm] cleared", stale.length, "stale fcm tokens")
  }
}
