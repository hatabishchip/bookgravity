import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, View, StyleSheet, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { WebView } from "react-native-webview"
import * as Notifications from "expo-notifications"
import { useRouter } from "expo-router"
import { api, API_BASE } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { PULL_TO_REFRESH_JS } from "@/lib/webview-pull-refresh"

const NATIVE_FLAG_JS = "window.__GS_NATIVE__ = true; true;"

// Trainer inbox: the web /trainer/inbox embedded in a WebView with a
// bridge token so the trainer stays logged in. Resets the app badge to 0
// on open (the user has come to read their messages).
export default function TrainerInboxWebView() {
  const { theme } = useTheme()
  const router = useRouter()
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
    // Opening the inbox clears the stale tray notifications (so the Android icon
    // badge, which counts tray items, doesn't show a wrong number) - but the
    // icon badge is then set to the REAL unanswered-conversation count, NOT 0.
    // Owner rule (2026-07-03): merely opening the inbox must not zero the count;
    // it drops only when a message is actually answered.
    ;(async () => {
      try {
        const presented = await Notifications.getPresentedNotificationsAsync()
        await Promise.all(
          presented
            .filter((n) => (n.request.content.data as { category?: string } | undefined)?.category === "message")
            .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})),
        )
      } catch { /* best-effort */ }
      try {
        const res = await api<{ unread: number }>("/api/push/unread")
        await Notifications.setBadgeCountAsync(res.unread)
      } catch {
        Notifications.setBadgeCountAsync(0).catch(() => {})
      }
    })()
  }, [bridge])

  const onNav = useCallback((navState: { url: string }) => {
    // Sentinel = user tapped Sign Out → clear the native session, don't re-bridge.
    if (/[?&]native_signout=1/.test(navState.url)) {
      useAuth.getState().signOut().catch(() => {})
      router.replace("/(auth)/login")
      return
    }
    if (/\/login(\?|$)/.test(navState.url)) bridge()
  }, [bridge, router])

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
          injectedJavaScriptBeforeContentLoaded={NATIVE_FLAG_JS}
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
