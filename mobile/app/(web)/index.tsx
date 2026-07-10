import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, View, StyleSheet, Pressable, Linking } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { WebView, type WebViewMessageEvent } from "react-native-webview"
import { useLocalSearchParams, useRouter } from "expo-router"
import { api, API_BASE } from "@/lib/api"
import { useAuth, webHomeFor, type AuthUser } from "@/lib/auth"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { PULL_TO_REFRESH_JS } from "@/lib/webview-pull-refresh"

// Marks the embedded web session as "running inside the native app": the web
// sign-out routes to the native-signout sentinel, the layouts mount the
// NativeAuthBridge (token handover for push) and show "Notification settings".
const NATIVE_FLAG_JS = "window.__GS_NATIVE__ = true; true;"

// THE app screen: the mobile web 1:1 (owner metaprompt 09.07 - "a person who
// used the web version and opened the app must not notice any difference").
//  - Guest: plain https://bookgravity.com - public schedule, web login button.
//  - Signed-in (native tokens cached, e.g. migrating from older versions or a
//    previous web login): bridge straight into the same web session.
//  - Web login INSIDE the WebView: the page posts {type:"native-auth", ...}
//    with a native token pair (see /api/auth/web-to-native) - we adopt it and
//    register this device for push. Sign-out sentinel clears it again.
export default function AppWebView() {
  const { theme } = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{ next?: string }>()
  const nextParam = typeof params.next === "string" && params.next ? params.next : null

  const [uri, setUri] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const webRef = useRef<WebView>(null)

  // BLANK-SCREEN WATCHDOG (Sveta 10.07: a stale WebView cache served HTML
  // whose chunks a newer deploy had deleted - white screen until she cleared
  // the app cache by hand). The page's self-heal script posts "web-alive"
  // once React mounts; if that handshake doesn't arrive in time (or the main
  // document fails outright), the shell clears the WebView cache and reloads
  // with a cache-busting query - the "clear cache" fix, done automatically.
  // One retry, then the honest error screen.
  const aliveRef = useRef(false)
  const healedRef = useRef(false)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reportRecovery = useCallback((reason: string) => {
    api("/api/native/log-crash", {
      method: "POST",
      body: { message: `webview-self-heal: ${reason}`, kind: "recovery", platform: "app-shell" },
      auth: false,
    }).catch(() => {})
  }, [])

  const heal = useCallback((reason: string) => {
    if (aliveRef.current) return
    if (healedRef.current) {
      setError("No connection. Tap to retry.")
      return
    }
    healedRef.current = true
    reportRecovery(reason)
    try {
      // Android; harmless no-op elsewhere.
      ;(webRef.current as unknown as { clearCache?: (b: boolean) => void })?.clearCache?.(true)
    } catch { /* not supported on this platform */ }
    setUri((u) => {
      if (!u) return u
      const sep = u.includes("?") ? "&" : "?"
      return `${u}${sep}gsheal=${Math.floor(Math.random() * 1e9)}`
    })
  }, [reportRecovery])

  const armWatchdog = useCallback(() => {
    aliveRef.current = false
    if (watchdogRef.current) clearTimeout(watchdogRef.current)
    // Generous 20s: the page's own inline self-heal gets to run first when
    // the HTML loaded; this net only catches "nothing loaded at all".
    watchdogRef.current = setTimeout(() => heal("handshake-timeout"), 20_000)
  }, [heal])

  useEffect(() => () => { if (watchdogRef.current) clearTimeout(watchdogRef.current) }, [])

  const open = useCallback(async () => {
    setError(null)
    setUri(null)
    const user = useAuth.getState().user
    const next = nextParam ?? webHomeFor(user?.role)
    if (!user) {
      // Guest: straight to the public site (or the pushed deep link).
      setUri(`${API_BASE}${next}`)
      return
    }
    try {
      const { token } = await api<{ token: string }>("/api/auth/native/web-token")
      setUri(`${API_BASE}/native-bridge?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`)
    } catch (err) {
      // Offline → honest retry screen. A dead native session (401) just means
      // "browse as a guest and sign in with the web form".
      if (err && typeof err === "object" && "status" in err && (err as { status?: number }).status === 401) {
        setUri(`${API_BASE}${next}`)
      } else {
        setError("No connection. Tap to retry.")
      }
    }
  }, [nextParam])

  useEffect(() => { open() }, [open])

  // Every (re)load gets a fresh watchdog window.
  useEffect(() => {
    if (uri) armWatchdog()
  }, [uri, armWatchdog])

  // Messages posted by the web page (only inside the app, see NativeAppBridge
  // on the web side).
  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: { type?: string; token?: string; refreshToken?: string; user?: AuthUser } | null = null
    try {
      msg = JSON.parse(e.nativeEvent.data)
    } catch {
      return
    }
    if (!msg) return
    if (msg.type === "web-alive") {
      aliveRef.current = true
      healedRef.current = false
      if (watchdogRef.current) clearTimeout(watchdogRef.current)
      return
    }
    if (msg.type === "native-auth" && msg.token && msg.refreshToken && msg.user) {
      void useAuth.getState().adoptWebLogin({ token: msg.token, refreshToken: msg.refreshToken, user: msg.user })
    } else if (msg.type === "open-notifications") {
      router.push("/(web)/notifications")
    }
  }, [router])

  // Sign-out sentinel vs expired web cookie:
  //  - /login?native_signout=1 → the user chose to leave: clear the native
  //    session (push deregisters) and stay in the WebView as a guest.
  //  - any other /login WITH a live native session → cookie expired, re-bridge
  //    silently. As a guest, /login is just a page - don't interfere.
  const onNav = useCallback((navState: { url: string }) => {
    if (/[?&]native_signout=1/.test(navState.url)) {
      ;(async () => {
        await useAuth.getState().signOut().catch(() => {})
        setUri(`${API_BASE}/`)
      })()
      return
    }
    if (/\/login(\?|$)/.test(navState.url) && useAuth.getState().user) open()
  }, [open])

  // Google OAuth can't run inside an embedded WebView (disallowed_useragent):
  // calendar connect goes through a bridged system-browser session; any other
  // Google page opens in the system browser too.
  const onShouldStart = useCallback((req: { url: string }) => {
    const u = req.url
    if (u.includes("/api/admin/google/calendar/connect")) {
      ;(async () => {
        try {
          const { token } = await api<{ token: string }>("/api/auth/native/web-token")
          const url = `${API_BASE}/native-bridge?token=${encodeURIComponent(token)}&next=${encodeURIComponent("/api/admin/google/calendar/connect")}`
          await Linking.openURL(url)
        } catch {
          /* the admin can connect from a desktop browser */
        }
      })()
      return false
    }
    if (/accounts\.google\.com|google\.com\/o\/oauth/i.test(u)) {
      Linking.openURL(u).catch(() => {})
      return false
    }
    return true
  }, [])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#ffffff" }} edges={["top"]}>
      {error ? (
        <Pressable style={styles.center} onPress={() => open()}>
          <Text tone="muted" variant="body" style={{ textAlign: "center" }}>{error}</Text>
          <Pressable
            onPress={() => open()}
            style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: theme.brand.primary }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
          </Pressable>
        </Pressable>
      ) : !uri ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand.primary} /></View>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri }}
          onMessage={onMessage}
          onNavigationStateChange={onNav}
          onShouldStartLoadWithRequest={onShouldStart}
          onError={() => heal("load-error")}
          onHttpError={(e) => {
            // Only the main document counts - a failed analytics beacon or
            // image must not nuke the whole view.
            if (e.nativeEvent.url && uri && e.nativeEvent.url.split("?")[0] === uri.split("?")[0]) heal(`http-${e.nativeEvent.statusCode}`)
          }}
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
          style={{ flex: 1, backgroundColor: "#ffffff" }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
})
