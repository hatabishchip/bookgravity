import { View, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { Button } from "@/components/ui/Button"

// Placeholder for the QR check-in screen. Next phase wires expo-camera
// here, asks the user for permission, and posts the scanned ticket code
// to /api/trainer/bookings/verify.
export default function CheckInTab() {
  const { theme } = useTheme()
  return (
    <SafeAreaView style={{ flex: 1, padding: spacing.xl, gap: spacing.lg }} edges={["top"]}>
      <Text variant="title2" tone="primary">Check in clients</Text>
      <Text variant="subhead" tone="muted">
        Scan the QR code on a client&apos;s ticket to confirm their arrival.
      </Text>

      <View style={[styles.scanArea, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
        <Text variant="callout" tone="brand">📷</Text>
        <Text variant="headline" tone="primary" style={{ marginTop: spacing.sm }}>QR scanner</Text>
        <Text variant="footnote" tone="muted" style={{ marginTop: spacing.xs, textAlign: "center" }}>
          Camera permission will be requested when the scanner is implemented.
        </Text>
      </View>

      <Button title="Open scanner" onPress={() => { /* expo-camera in next iteration */ }} disabled />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  scanArea: {
    flex: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
})
