import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, View, StyleSheet, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { WebView } from "react-native-webview"
import { useLocalSearchParams } from "expo-router"
import { api, API_BASE } from "@/lib/api"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { PULL_TO_REFRESH_JS } from "@/lib/webview-pull-refresh"

// Admin home: the full web admin embedded in a WebView. We mint a short-lived
// bridge token from the native session and open /native-bridge, which signs the
// WebView into the same web session and lands on /admin. If the WebView ever
// falls back to /login (web cookie expired), we silently re-bridge.
export default function AdminWebView() {
  const { theme } = useTheme()
  const params = useLocalSearchParams<{ next?: string }>()
  const next = typeof params.next === "string" && params.next ? params.next : "/admin"

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
      setError("Could not open the admin. Pull to retry.")
    }
  }, [next])

  useEffect(() => { bridge() }, [bridge])

  // If the WebView lands on the web login (session lost), re-bridge so the admin
  // never has to type a password again.
  const onNav = useCallback((navState: { url: string }) => {
    if (/\/login(\?|$)/.test(navState.url)) bridge()
  }, [bridge])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg.card }} edges={["top"]}>
      {error ? (
        <Pressable style={styles.center} onPress={() => bridge()}>
          <Text tone="muted" variant="body" style={{ textAlign: "center" }}>{error}</Text>
        </Pressable>
      ) : !uri ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand.primary} /></View>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri }}
          onNavigationStateChange={onNav}
          onError={() => setError("Could not load the admin. Pull to retry.")}
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
