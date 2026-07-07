import { useEffect } from "react"
import { AppState, Platform } from "react-native"
import { Stack, useRouter, useSegments } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as SplashScreen from "expo-splash-screen"
import * as Notifications from "expo-notifications"
import * as Updates from "expo-updates"
import { useAuth, homeRouteFor } from "@/lib/auth"
import { useTheme } from "@/hooks/useTheme"
import { api } from "@/lib/api"
import { ErrorBoundary } from "@/components/ErrorBoundary"

// Hide the native splash until we've at least read the secure store, so
// the user never sees a flash of "Sign in" before the cached session
// rehydrates into the trainer/client tabs.
SplashScreen.preventAutoHideAsync().catch(() => {})

// Android notification channels for chat messages. Created once at startup;
// the server picks the right channel via channelId in the push payload.
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("chat_sound_vibration", {
    name: "Chat - Sound & Vibration",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
  }).catch(() => {})
  Notifications.setNotificationChannelAsync("chat_vibration", {
    name: "Chat - Vibration only",
    importance: Notifications.AndroidImportance.HIGH,
    sound: null,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
  }).catch(() => {})
  Notifications.setNotificationChannelAsync("chat_sound", {
    name: "Chat - Sound only",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: undefined,
    enableVibrate: false,
  }).catch(() => {})
}

// Collapse stacked chat notifications down to one per conversation. Android
// launchers render the app-icon badge as the number of notifications sitting
// in the tray, so 8 messages in a single chat read as "8" on the icon while the
// inbox correctly counts "1" conversation. Keeping only the newest notification
// per conversationId makes the tray count match the conversation count. Run on
// foreground and whenever a message arrives while the app is running.
async function reconcileChatNotifications(): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    const byConvo = new Map<string, string[]>()
    for (const n of presented) {
      const d = n.request.content.data as { category?: string; conversationId?: string } | undefined
      if (d?.category !== "message") continue
      const cid = d.conversationId ?? "_"
      const ids = byConvo.get(cid) ?? []
      ids.push(n.request.identifier)
      byConvo.set(cid, ids)
    }
    for (const ids of byConvo.values()) {
      // Drop every notification but the last (newest) for that conversation.
      for (let i = 0; i < ids.length - 1; i++) {
        await Notifications.dismissNotificationAsync(ids[i]).catch(() => {})
      }
    }
  } catch {
    // getPresentedNotificationsAsync is Android/iOS only and can throw on some
    // OS versions - the badge sync below still runs, so this is best-effort.
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Slot data changes minute-by-minute (someone may book between
      // renders) so we keep a short stale window and refetch on focus.
      staleTime: 30_000,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
})

export default function RootLayout() {
  const { theme } = useTheme()
  const hydrate = useAuth((s) => s.hydrate)
  const user = useAuth((s) => s.user)
  const bootstrapped = useAuth((s) => s.bootstrapped)
  const router = useRouter()
  const segments = useSegments()

  // 1. One-shot: read SecureStore on cold start.
  useEffect(() => { hydrate() }, [hydrate])

  // 2. Once we know who they are, redirect to the right surface.
  useEffect(() => {
    if (!bootstrapped) return
    SplashScreen.hideAsync().catch(() => {})

    const group = segments[0]
    const inAuthGroup = group === "(auth)"
    const inStaffGroup = group === "(trainer)" || group === "(admin)"
    if (!user) {
      // Guests can browse the schedule and book without an account - the
      // /api/slots and /api/bookings endpoints are public, exactly like the
      // web booking flow. Only the trainer/admin surfaces need a sign-in.
      if (inStaffGroup) {
        router.replace("/(auth)/login")
      } else if (group !== "(client)" && !inAuthGroup) {
        router.replace("/(client)")
      }
      return
    }
    if (user && inAuthGroup) {
      router.replace(homeRouteFor(user.role))
    }
  }, [bootstrapped, user, segments, router])

  // 3. Badge: fetch unread chat count and sync it to the app icon badge.
  //    Runs on startup (when user is known) and every time the app comes
  //    to the foreground, so the badge stays fresh.
  useEffect(() => {
    if (!user) {
      Notifications.setBadgeCountAsync(0).catch(() => {})
      Notifications.dismissAllNotificationsAsync().catch(() => {})
      return
    }
    const refresh = async () => {
      try {
        // Collapse stacked chat notifications first so the tray (and therefore
        // the Android icon badge) reflects conversations, not raw message count.
        await reconcileChatNotifications()
        const res = await api<{ unread: number }>("/api/push/unread")
        await Notifications.setBadgeCountAsync(res.unread)
      } catch { /* no-op: offline or token expired */ }
    }
    refresh()
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh() })
    return () => sub.remove()
  }, [user])

  // 3b. While the app is open, collapse duplicate chat notifications as they
  //     arrive and keep the icon badge equal to the unread-conversation count.
  useEffect(() => {
    if (!user) return
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const d = n.request.content.data as { category?: string } | undefined
      if (d?.category !== "message") return
      // Small delay so the just-arrived notification is in the tray before we
      // dedupe, then re-sync the badge to the conversation count.
      setTimeout(() => {
        reconcileChatNotifications()
          .then(() => api<{ unread: number }>("/api/push/unread"))
          .then((res) => Notifications.setBadgeCountAsync(res.unread))
          .catch(() => {})
      }, 500)
    })
    return () => sub.remove()
  }, [user])

  // 4. Notification tap handler. The backend sends data.category="booking"
  //    with data.slotId so we can deep-link into the trainer's class screen
  //    when they tap a "new booking" push. For "message" taps, open the inbox
  //    in the right WebView depending on role.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as
        | { category?: string; slotId?: string; conversationId?: string }
        | undefined
      if (!data) return
      if (data.category === "booking" && data.slotId) {
        router.push({ pathname: "/(trainer)/class", params: { slotId: data.slotId } })
      } else if (data.category === "message") {
        const role = useAuth.getState().user?.role
        if (role === "ADMIN" || role === "SUPER_ADMIN") {
          router.push({ pathname: "/(admin)", params: { next: "/admin/inbox" } })
        } else {
          // Trainer: open their inbox WebView (tab index 4, "Messages").
          router.push("/(trainer)/inbox")
        }
      }
    })
    return () => sub.remove()
  }, [router])

  // 4. OTA: silently check + download a pushed JS/asset fix on cold start and
  //    whenever the app returns to the foreground, so it's ready to apply.
  //    The user applies it from Profile > "Check for updates" (which reloads
  //    into it), or it applies automatically on the next cold start. No-ops in
  //    Expo Go / dev where Updates.isEnabled is false.
  useEffect(() => {
    if (!Updates.isEnabled) return
    const check = async () => {
      try {
        const res = await Updates.checkForUpdateAsync()
        if (res.isAvailable) await Updates.fetchUpdateAsync()
      } catch {
        // Offline or no update server reachable - ignore, try again next time.
      }
    }
    check()
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check()
    })
    return () => sub.remove()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg.page }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          {/* Turns any screen-render crash into a readable message + reload
              instead of a blank white screen (07.07 trainer white-screen). */}
          <ErrorBoundary>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.bg.page },
                animation: "fade",
              }}
            />
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
