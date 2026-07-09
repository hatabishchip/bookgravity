import { View, Pressable, ScrollView, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { ChevronLeft } from "lucide-react-native"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { NotificationSettings } from "@/components/NotificationSettings"
import { UpdateButton } from "@/components/UpdateButton"

// The one native screen left: notification permission + delivery status
// (things the web page can't see). Opened from the web cabinet's
// "Notification settings" menu item, which only exists inside the app.
export default function NotificationsScreen() {
  const { theme } = useTheme()
  const router = useRouter()

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}
          aria-label="Back"
        >
          <ChevronLeft size={24} color={theme.text.primary} />
        </Pressable>
        <Text variant="title2" tone="primary">Notifications</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          <NotificationSettings />
        </View>

        <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>App</Text>
          <UpdateButton />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
})
