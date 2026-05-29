import { View, ScrollView, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"

export default function BookingsTab() {
  const { theme } = useTheme()
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <Text variant="title2" tone="primary">Your tickets</Text>
        <Text variant="subhead" tone="muted">
          Past and upcoming bookings, with a QR code to show at the studio.
        </Text>

        <View style={[styles.placeholder, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          <Text variant="callout" tone="brand">🎟️</Text>
          <Text variant="headline" tone="primary" style={{ marginTop: spacing.sm }}>No tickets yet</Text>
          <Text variant="subhead" tone="muted" style={{ marginTop: spacing.xs, textAlign: "center" }}>
            Book a class to see your tickets and check-in QR here.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  placeholder: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    alignItems: "center",
  },
})
