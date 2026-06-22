import { useEffect } from "react"
import { AppState } from "react-native"
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

// Hide the native splash until we've at least read the secure store, so
// the user never sees a flash of "Sign in" before the cached session
// rehydrates into the trainer/client tabs.
SplashScreen.preventAutoHideAsync().catch(() => {})

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

    const inAuthGroup = segments[0] === "(auth)"
    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login")
      return
    }
    if (user && inAuthGroup) {
      router.replace(homeRouteFor(user.role))
    }
  }, [bootstrapped, user, segments, router])

  // 3. Notification tap handler. The backend sends data.category="booking"
  //    with data.slotId so we can deep-link into the trainer's class screen
  //    when they tap a "new booking" push.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as
        | { category?: string; slotId?: string; conversationId?: string }
        | undefined
      if (!data) return
      if (data.category === "booking" && data.slotId) {
        router.push({ pathname: "/(trainer)/class", params: { slotId: data.slotId } })
      } else if (data.category === "message") {
        // A client wrote in. Admins land in the web inbox (inside the admin
        // WebView); trainers just get the ring (no native inbox screen yet).
        const role = useAuth.getState().user?.role
        if (role === "ADMIN" || role === "SUPER_ADMIN") {
          router.push({ pathname: "/(admin)", params: { next: "/admin/inbox" } })
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
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.bg.page },
              animation: "fade",
            }}
          />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
