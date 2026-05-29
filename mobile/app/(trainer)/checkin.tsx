import { useEffect, useRef, useState } from "react"
import { View, Pressable, StyleSheet, Linking, Platform } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { CameraView, useCameraPermissions } from "expo-camera"
import * as Haptics from "expo-haptics"
import { ChevronLeft, Camera, CheckCircle2, AlertTriangle } from "lucide-react-native"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { Button } from "@/components/ui/Button"
import { api, ApiError } from "@/lib/api"

type Result =
  | { kind: "ok"; message: string }
  | { kind: "already"; message: string }
  | { kind: "error"; message: string }

// Trainer's QR check-in. expo-camera draws the full-screen scanner with a
// translucent overlay that focuses attention on a square viewfinder. On a
// successful scan we POST to /api/trainer/bookings/verify and show a green
// banner; conflicts get amber, errors get red. After 1.5s the scanner
// re-arms so the trainer can do back-to-back check-ins without tapping.
export default function CheckInTab() {
  const { theme } = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const [scanning, setScanning] = useState(true)
  const [result, setResult] = useState<Result | null>(null)
  const lastCodeRef = useRef<string | null>(null)

  // Re-arm after each result so back-to-back scans work without a tap.
  useEffect(() => {
    if (!result) return
    const t = setTimeout(() => {
      setResult(null)
      setScanning(true)
      lastCodeRef.current = null
    }, 1500)
    return () => clearTimeout(t)
  }, [result])

  const handleScan = async (raw: string) => {
    if (!scanning) return
    if (raw === lastCodeRef.current) return
    lastCodeRef.current = raw
    setScanning(false)

    // Parse our gs-ticket payload. Be lenient: a manually-typed code is
    // also a valid checkin path so we treat plain digits as the ticket code
    // with a missing bookingId (the verify endpoint requires both, so this
    // will short-circuit to an error — that's a future enhancement).
    let bookingId = ""
    let code = ""
    try {
      const parsed = JSON.parse(raw) as { bookingId?: string; code?: string }
      if (parsed.bookingId && parsed.code) {
        bookingId = parsed.bookingId
        code = String(parsed.code)
      }
    } catch {
      // Not JSON
    }
    if (!bookingId || !code) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setResult({ kind: "error", message: "Unrecognised QR code" })
      return
    }

    try {
      const r = await api<{ ok: true; alreadyCheckedIn: boolean }>("/api/trainer/bookings/verify", {
        method: "POST",
        body: { bookingId, code },
      })
      if (r.alreadyCheckedIn) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        setResult({ kind: "already", message: `Ticket #${code} was already checked in` })
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setResult({ kind: "ok", message: `Checked in #${code}` })
      }
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Check-in failed"
      setResult({ kind: "error", message: msg })
    }
  }

  // Permission gate
  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: theme.bg.page }} />
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: "center", alignItems: "center" }} edges={["top"]}>
        <Camera size={56} color={theme.brand.primary} />
        <Text variant="title3" tone="primary" style={{ textAlign: "center" }}>
          Camera permission required
        </Text>
        <Text variant="footnote" tone="muted" style={{ textAlign: "center", maxWidth: 320 }}>
          We need access to your camera to scan QR codes on client tickets. No photos are taken or stored.
        </Text>
        <Button
          title={permission.canAskAgain ? "Allow camera" : "Open Settings"}
          onPress={() => permission.canAskAgain ? requestPermission() : Linking.openSettings()}
        />
      </SafeAreaView>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanning ? ({ data }) => handleScan(data) : undefined}
      />

      {/* Translucent overlay with a square viewfinder cutout */}
      <View style={styles.overlay}>
        <SafeAreaView edges={["top"]}>
          <View style={styles.topBar}>
            <Pressable onPress={() => Platform.OS === "ios" ? Linking.openSettings() : null} hitSlop={10} style={styles.iconBtn}>
              <ChevronLeft size={24} color="#FFF" />
            </Pressable>
            <Text style={styles.title}>Check-in</Text>
            <View style={{ width: 32 }} />
          </View>
        </SafeAreaView>

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <View style={styles.viewfinder} />
          <Text style={styles.hint}>Align the client&apos;s ticket QR inside the square</Text>
        </View>

        {/* Result banner */}
        {result && (
          <View style={{ padding: spacing.lg }}>
            <View style={[
              styles.banner,
              result.kind === "ok" && { backgroundColor: "rgba(22,163,74,0.95)" },
              result.kind === "already" && { backgroundColor: "rgba(245,158,11,0.95)" },
              result.kind === "error" && { backgroundColor: "rgba(220,38,38,0.95)" },
            ]}>
              {result.kind === "ok" ? <CheckCircle2 size={20} color="#FFF" /> : <AlertTriangle size={20} color="#FFF" />}
              <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 15 }}>{result.message}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}

const VIEWFINDER = 260

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  iconBtn: { width: 32, alignItems: "flex-start" },
  title: { flex: 1, color: "#FFF", fontWeight: "600", fontSize: 17, textAlign: "center" },
  viewfinder: {
    width: VIEWFINDER,
    height: VIEWFINDER,
    borderRadius: radius.xl,
    borderWidth: 4,
    borderColor: "#FFFFFFEE",
  },
  hint: {
    color: "#FFFFFFCC",
    fontSize: 13,
    fontWeight: "500",
    marginTop: spacing.xl,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
})
