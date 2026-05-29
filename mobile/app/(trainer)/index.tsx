import { View, ScrollView, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"

export default function TrainerScheduleTab() {
  const { theme } = useTheme()
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <Text variant="title2" tone="primary">Your schedule</Text>
        <Text variant="subhead" tone="muted">Today, this week, and upcoming bookings.</Text>

        <View style={[styles.placeholder, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          <Text variant="callout" tone="brand">📆</Text>
          <Text variant="headline" tone="primary" style={{ marginTop: spacing.sm }}>Schedule view coming next</Text>
          <Text variant="subhead" tone="muted" style={{ marginTop: spacing.xs, textAlign: "center" }}>
            Today’s classes with client lists, swipe-to-cancel, tap to check in.
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
