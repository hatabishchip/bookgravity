import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, Linking, Platform, Pressable, StyleSheet, View } from "react-native"
import * as Updates from "expo-updates"
import { RefreshCw } from "lucide-react-native"
import { Text } from "@/components/ui/Text"
import { API_BASE } from "@/lib/api"

// Full-screen "Update available" prompt (owner metaprompt 12.07): when an
// update is ready - either a downloaded OTA (our JS fixes, applies in ~1s) or
// a newer build in the App Store / Play Market - cover the screen with two
// buttons: Update now / Later.
//
//  - OTA takes priority: one tap restarts straight into the fix, no store.
//  - Store mode opens the app's store page instead.
//  - "Later" hides the prompt for this app run; the silent safety net stays:
//    a pending OTA still self-applies when the app goes to the background or
//    on the next cold start (see app/_layout.tsx), so "Later" never strands
//    anyone on old code - it just doesn't interrupt them right now.
//  - A dead/white page never sees this screen: the root layout auto-applies
//    a pending OTA immediately in that case (nobody's work to interrupt).

const IOS_APP_ID = "6784350273"
const ANDROID_PACKAGE = "com.bookgravity.gravitystretching"
const STORE_CHECK_TTL_MS = 6 * 60 * 60 * 1000

const cmpVersions = (a: string, b: string) => {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function UpdateGate() {
  const { isUpdatePending } = Updates.useUpdates()
  const [storeVersion, setStoreVersion] = useState<string | null>(null)
  const [dismissedOta, setDismissedOta] = useState(false)
  const [dismissedStore, setDismissedStore] = useState<string | null>(null)
  const lastStoreCheck = useRef(0)

  // Installed app version. runtimeVersion policy = appVersion, so this equals
  // the store version of the installed build. Null in Expo Go/dev -> disabled.
  const installed = Updates.isEnabled ? Updates.runtimeVersion : null

  const checkStore = useCallback(async () => {
    if (!installed) return
    if (Date.now() - lastStoreCheck.current < STORE_CHECK_TTL_MS) return
    lastStoreCheck.current = Date.now()
    try {
      const r = await fetch(`${API_BASE}/api/native/store-version`)
      if (!r.ok) return
      const d = (await r.json()) as { ios: string | null; android: string | null }
      const latest = Platform.OS === "ios" ? d.ios : d.android
      if (latest && cmpVersions(latest, installed) > 0) setStoreVersion(latest)
    } catch { /* offline - try again next foreground */ }
  }, [installed])

  useEffect(() => {
    checkStore()
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") checkStore() })
    return () => sub.remove()
  }, [checkStore])

  // OTA first (instant, no store round-trip); store prompt only without one.
  const mode: "ota" | "store" | null =
    isUpdatePending && !dismissedOta
      ? "ota"
      : storeVersion && dismissedStore !== storeVersion
        ? "store"
        : null
  if (!mode) return null

  const update = () => {
    if (mode === "ota") {
      Updates.reloadAsync().catch(() => {})
      return
    }
    const native = Platform.OS === "ios"
      ? `itms-apps://itunes.apple.com/app/id${IOS_APP_ID}`
      : `market://details?id=${ANDROID_PACKAGE}`
    const web = Platform.OS === "ios"
      ? `https://apps.apple.com/app/id${IOS_APP_ID}`
      : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`
    Linking.openURL(native).catch(() => Linking.openURL(web).catch(() => {}))
  }

  const later = () => {
    if (mode === "ota") setDismissedOta(true)
    else setDismissedStore(storeVersion)
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <RefreshCw size={30} color="#2C6E49" strokeWidth={2.25} />
        </View>
        <Text style={styles.title}>Update available</Text>
        <Text style={styles.subtitle}>
          {mode === "ota"
            ? "A new version of the app is ready. Updating takes a second."
            : `Version ${storeVersion} is out. Get it from the ${Platform.OS === "ios" ? "App Store" : "Play Store"}.`}
        </Text>
        <Pressable onPress={update} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryText}>Update now</Text>
        </Pressable>
        <Pressable onPress={later} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}>
          <Text style={styles.secondaryText}>Later</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: "#F5F4F0",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(44,110,73,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  primary: {
    width: "100%",
    backgroundColor: "#2C6E49",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryText: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
  secondary: { width: "100%", paddingVertical: 14, alignItems: "center", marginTop: 6 },
  secondaryText: { color: "#6B7280", fontWeight: "600", fontSize: 14 },
})
