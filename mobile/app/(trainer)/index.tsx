import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, View, StyleSheet, Pressable, Linking } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { WebView } from "react-native-webview"
import { useLocalSearchParams, useRouter } from "expo-router"
import { api, API_BASE } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { PULL_TO_REFRESH_JS } from "@/lib/webview-pull-refresh"

// Marks the embedded web session as "running inside the native app" so the web
// Sign Out button routes to the native-signout sentinel (see onNav).
const NATIVE_FLAG_JS = "window.__GS_NATIVE__ = true; true;"

// Trainer home: the full web trainer cabinet embedded in a WebView - the same
// bridge pattern as the admin surface. We mint a short-lived token from the
// native session and open /native-bridge, which signs the WebView into the
// same web session and lands on /trainer. If the WebView ever falls back to
// /login (web cookie expired), we silently re-bridge.
export default function TrainerWebView() {
  const { theme } = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{ next?: string }>()
  const next = typeof params.next === "string" && params.next ? params.next : "/trainer"

  const [uri, setUri] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const webRef = useRef<WebView>(null)

  const bridge = useCallback(async () => {
    setError(null)
    setUri(null)
    try {
      const { token } = await api<{ token: string }>("/api/auth/native/web-token")
      setUri(`${API_BASE}/native-bridge?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`)
    } catch {
      setError("Could not open your cabinet. Tap to retry.")
    }
  }, [next])

  useEffect(() => { bridge() }, [bridge])

  // Distinguish "user tapped Sign Out" from "web session merely expired":
  //  - sentinel /login?native_signout=1 → the user chose to leave: clear the
  //    NATIVE session too and go to the native login. Do NOT re-bridge (that
  //    would instantly log them back in from the still-valid native token).
  //  - any other /login → session expired → re-bridge silently for convenience.
  const onNav = useCallback((navState: { url: string }) => {
    if (/[?&]native_signout=1/.test(navState.url)) {
      useAuth.getState().signOut().catch(() => {})
      router.replace("/(auth)/login")
      return
    }
    if (/\/login(\?|$)/.test(navState.url)) bridge()
  }, [bridge, router])

  // Any Google sign-in page (blocked inside embedded WebViews) → system browser.
  const onShouldStart = useCallback((req: { url: string }) => {
    if (/accounts\.google\.com|google\.com\/o\/oauth/i.test(req.url)) {
      Linking.openURL(req.url).catch(() => {})
      return false
    }
    return true
  }, [])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg.card }} edges={["top"]}>
      {error ? (
        <Pressable style={styles.center} onPress={() => bridge()}>
          <Text tone="muted" variant="body" style={{ textAlign: "center" }}>{error}</Text>
          {/* Escape hatch: this screen has no tab bar, so without a sign-out a
              dead session (or a mis-routed role) traps the user in a retry
              loop that 401s forever. */}
          <Pressable
            onPress={() => {
              useAuth.getState().signOut().catch(() => {})
              router.replace("/(auth)/login")
            }}
            style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: theme.brand.primary }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Sign out</Text>
          </Pressable>
        </Pressable>
      ) : !uri ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand.primary} /></View>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri }}
          onNavigationStateChange={onNav}
          onShouldStartLoadWithRequest={onShouldStart}
          onError={() => setError("Could not load your cabinet. Tap to retry.")}
          injectedJavaScriptBeforeContentLoaded={NATIVE_FLAG_JS}
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.center, StyleSheet.absoluteFill]}><ActivityIndicator color={theme.brand.primary} /></View>
          )}
          // Persist cookies so the web session sticks between launches.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          injectedJavaScript={PULL_TO_REFRESH_JS}
          style={{ flex: 1, backgroundColor: theme.bg.card }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
})
