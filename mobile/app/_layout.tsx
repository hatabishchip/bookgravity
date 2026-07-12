import { useEffect, useRef } from "react"
import { AppState, Platform } from "react-native"
import { Stack, useRouter, useSegments } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as SplashScreen from "expo-splash-screen"
import * as Notifications from "expo-notifications"
import * as Updates from "expo-updates"
import { useAuth, webHomeFor } from "@/lib/auth"
import { useTheme } from "@/hooks/useTheme"
import { useThemePref } from "@/lib/theme-preference"
import { api } from "@/lib/api"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { webAlive } from "@/lib/web-alive"

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
// per conversationId makes the tray count match the conversation count. And
// when `stillUnread` is passed (owner rule 07.07): a notification whose chat
// is NO LONGER unread (the admin viewed it / someone answered - maybe from a
// laptop) is dismissed entirely, so the icon number can never go stale-high.
// Run on foreground and whenever a message arrives while the app is running.
async function reconcileChatNotifications(stillUnread?: Set<string>): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    const byConvo = new Map<string, string[]>()
    for (const n of presented) {
      const d = n.request.content.data as { category?: string; conversationId?: string } | undefined
      if (d?.category !== "message") continue
      const cid = d.conversationId ?? "_"
      // Chat already handled → its notification has nothing to tell anymore.
      if (stillUnread && cid !== "_" && !stillUnread.has(cid)) {
        await Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})
        continue
      }
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
  const { theme, mode } = useTheme()
  const hydrate = useAuth((s) => s.hydrate)
  const user = useAuth((s) => s.user)
  const bootstrapped = useAuth((s) => s.bootstrapped)
  const router = useRouter()
  const segments = useSegments()

  // 1. One-shot: read SecureStore on cold start (session + theme preference).
  useEffect(() => { hydrate() }, [hydrate])
  useEffect(() => { void useThemePref.getState().hydratePref() }, [])

  // 2. The whole app is ONE WebView surface (the mobile web 1:1, 09.07):
  //    guests and every role land on /(web); the web decides what to show.
  useEffect(() => {
    if (!bootstrapped) return
    SplashScreen.hideAsync().catch(() => {})
    if (segments[0] !== "(web)") router.replace("/(web)")
  }, [bootstrapped, segments, router])

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
        // Fetch which conversations are STILL unread, then reconcile the tray:
        // collapse duplicates per chat AND dismiss notifications for chats
        // already handled - the icon count follows the cabinet, never stale.
        const res = await api<{ unread: number; conversationIds?: string[] }>("/api/push/unread")
        await reconcileChatNotifications(res.conversationIds ? new Set(res.conversationIds) : undefined)
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
        api<{ unread: number; conversationIds?: string[] }>("/api/push/unread")
          .then(async (res) => {
            await reconcileChatNotifications(res.conversationIds ? new Set(res.conversationIds) : undefined)
            await Notifications.setBadgeCountAsync(res.unread)
          })
          .catch(() => {})
      }, 500)
    })
    return () => sub.remove()
  }, [user])

  // 4. Notification tap handler. The app is one WebView, so every tap
  //    deep-links via the `next` param: "message" opens the role's inbox
  //    page, "booking" the cabinet home (its schedule shows the new booking).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as
        | { category?: string; slotId?: string; conversationId?: string }
        | undefined
      if (!data) return
      const role = useAuth.getState().user?.role
      const home = webHomeFor(role)
      if (data.category === "booking") {
        router.push({ pathname: "/(web)", params: { next: home } })
      } else if (data.category === "message") {
        router.push({ pathname: "/(web)", params: { next: home === "/" ? "/" : `${home}/inbox` } })
      }
    })
    return () => sub.remove()
  }, [router])

  // 4. OTA: silently check + download a pushed JS/asset fix on cold start and
  //    whenever the app returns to the foreground - then APPLY it by itself
  //    (metaprompt 12.07, gap D3: "waits for the next cold start" was the last
  //    place a user had to do anything):
  //      - page not proven alive (cold start still booting, white screen,
  //        killed renderer) -> reload into the new bundle NOW; it can't
  //        interrupt work that isn't happening, and it's very likely the cure;
  //      - page alive (someone may be mid-booking) -> apply when the app goes
  //        to the BACKGROUND: invisible, nothing is interrupted.
  //    No-ops in Expo Go / dev where Updates.isEnabled is false.
  const { isUpdatePending } = Updates.useUpdates()
  const updatePendingRef = useRef(false)
  useEffect(() => { updatePendingRef.current = isUpdatePending }, [isUpdatePending])

  useEffect(() => {
    if (!Updates.isEnabled) return
    const check = async () => {
      try {
        const res = await Updates.checkForUpdateAsync()
        if (!res.isAvailable) return
        await Updates.fetchUpdateAsync()
        // Nothing proven alive on screen -> restart into the fix right away.
        if (!webAlive.current) await Updates.reloadAsync()
      } catch {
        // Offline or no update server reachable - ignore, try again next time.
      }
    }
    check()
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check()
      // Best-effort invisible apply; the next cold start remains the fallback.
      if (s === "background" && updatePendingRef.current) Updates.reloadAsync().catch(() => {})
    })
    return () => sub.remove()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bg.page }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/* Follow the APP theme, not the phone: "auto" would draw light
              icons over our light-by-default screens on dark phones. */}
          <StatusBar style={mode === "dark" ? "light" : "dark"} />
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
