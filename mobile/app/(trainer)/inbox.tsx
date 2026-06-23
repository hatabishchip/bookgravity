import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, View, StyleSheet, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { WebView } from "react-native-webview"
import * as Notifications from "expo-notifications"
import { api, API_BASE } from "@/lib/api"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { PULL_TO_REFRESH_JS } from "@/lib/webview-pull-refresh"

// Trainer inbox: the web /trainer/inbox embedded in a WebView with a
// bridge token so the trainer stays logged in. Resets the app badge to 0
// on open (the user has come to read their messages).
export default function TrainerInboxWebView() {
  const { theme } = useTheme()
  const [uri, setUri] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const webRef = useRef<WebView>(null)

  const bridge = useCallback(async () => {
    setError(null)
    setUri(null)
    try {
      const { token } = await api<{ token: string }>("/api/auth/native/web-token")
      setUri(`${API_BASE}/native-bridge?token=${encodeURIComponent(token)}&next=${encodeURIComponent("/trainer/inbox")}`)
    } catch {
      setError("Could not open inbox. Tap to retry.")
    }
  }, [])

  useEffect(() => {
    bridge()
    // Clear the app icon badge — the user opened the inbox.
    Notifications.setBadgeCountAsync(0).catch(() => {})
  }, [bridge])

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
          onError={() => setError("Could not load inbox. Tap to retry.")}
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.center, StyleSheet.absoluteFill]}>
              <ActivityIndicator color={theme.brand.primary} />
            </View>
          )}
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
