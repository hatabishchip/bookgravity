import { View, ScrollView, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"

// Placeholder for the booking calendar. The next phase wires this to
// /api/slots and renders the same month grid as the web booking widget.
// Keeping the surface area minimal here so we can ship navigation /
// auth / theming as one foundation commit and iterate on screens.
export default function CalendarTab() {
  const { theme } = useTheme()
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <Text variant="title2" tone="primary">Book a class</Text>
        <Text variant="subhead" tone="muted">
          Pick a date to see available time slots.
        </Text>

        <View style={[styles.placeholder, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          <Text variant="callout" tone="brand">📅</Text>
          <Text variant="headline" tone="primary" style={{ marginTop: spacing.sm }}>Calendar coming next</Text>
          <Text variant="subhead" tone="muted" style={{ marginTop: spacing.xs, textAlign: "center" }}>
            We&apos;ll mirror the web booking calendar here in the next iteration — same green dots for
            available days, rose for fully booked, gray for past classes.
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
