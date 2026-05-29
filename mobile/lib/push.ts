// Expo push notification registration. Called after a successful sign-in and
// on cold start, so the backend always has a fresh token for this device.
//
// Flow:
//   1. Ask the OS for notification permission (no-op on simulator).
//   2. Ask Expo for a push token (devicePushToken under the hood is the
//      native APNS/FCM token; Expo wraps it so we can use the relay).
//   3. POST { expoPushToken, platform, deviceName } to /api/native/push-token.
//   4. On sign-out, DELETE the same token so we stop sending to the device.
//
// We never throw — push is a "nice-to-have" and must not block the auth
// flow. Failures are console.warn'd for debugging in dev builds.

import { Platform } from "react-native"
import Constants from "expo-constants"
import * as Notifications from "expo-notifications"
import * as Device from "expo-device"
import * as SecureStore from "expo-secure-store"
import { api } from "@/lib/api"

const LAST_TOKEN_KEY = "gs.push.lastToken"

// How a notification behaves when it arrives while the app is foregrounded.
// Without this, iOS would silently drop the banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    // Newer SDKs split alert into banner/list; keep both flags for safety.
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerPushToken(): Promise<void> {
  try {
    // Simulators / web preview can't receive remote pushes.
    if (!Device.isDevice) {
      console.log("[push] skip — not a physical device")
      return
    }

    // Ask the OS. On iOS this triggers the system prompt the first time.
    const current = await Notifications.getPermissionsAsync()
    let status = current.status
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync()
      status = req.status
    }
    if (status !== "granted") {
      console.log("[push] permission denied")
      return
    }

    // Expo needs the EAS projectId to issue a token bound to our app.
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId

    if (!projectId || projectId.startsWith("PLACEHOLDER")) {
      console.warn("[push] EAS projectId not configured yet — skip token request")
      return
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId })
    const expoPushToken = tokenResult.data
    if (!expoPushToken) {
      console.warn("[push] empty token from Expo")
      return
    }

    const platform: "ios" | "android" | "web" =
      Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web"
    const deviceName = Device.deviceName ?? Device.modelName ?? undefined

    await api("/api/native/push-token", {
      method: "POST",
      body: { expoPushToken, platform, deviceName },
    })
    await SecureStore.setItemAsync(LAST_TOKEN_KEY, expoPushToken)
    console.log("[push] registered token", expoPushToken.slice(0, 24), "…")
  } catch (err) {
    console.warn("[push] registerPushToken failed:", err)
  }
}

// Deregister this device's token at sign-out. We try to delete just the
// specific token so other devices the user is signed into elsewhere keep
// receiving notifications.
export async function deregisterPushToken(): Promise<void> {
  try {
    const last = await SecureStore.getItemAsync(LAST_TOKEN_KEY).catch(() => null)
    if (!last) return
    await api(`/api/native/push-token?expoPushToken=${encodeURIComponent(last)}`, {
      method: "DELETE",
    }).catch(() => {})
    await SecureStore.deleteItemAsync(LAST_TOKEN_KEY).catch(() => {})
  } catch (err) {
    console.warn("[push] deregisterPushToken failed:", err)
  }
}
