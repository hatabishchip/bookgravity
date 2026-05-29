import { useEffect } from "react"
import { Stack, useRouter, useSegments } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import * as SplashScreen from "expo-splash-screen"
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
