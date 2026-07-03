import { View, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useAuth } from "@/lib/auth"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { Button } from "@/components/ui/Button"
import { UpdateButton } from "@/components/UpdateButton"

export default function ProfileTab() {
  const { theme } = useTheme()
  const router = useRouter()
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)

  return (
    <SafeAreaView style={{ flex: 1, padding: spacing.xl, gap: spacing.lg }} edges={["top", "bottom"]}>
      <Text variant="title2" tone="primary">Profile</Text>

      {user ? (
        <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          <Text variant="caption" tone="muted">Signed in as</Text>
          <Text variant="headline" tone="primary" style={{ marginTop: 4 }}>{user.email}</Text>
          <Text variant="footnote" tone="muted" style={{ marginTop: 2 }}>
            {(user.role ?? "").toLowerCase()} · {user.studioSlug ?? "-"}
          </Text>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          <Text variant="headline" tone="primary">You are browsing as a guest</Text>
          <Text variant="footnote" tone="muted" style={{ marginTop: spacing.xs }}>
            You can browse the schedule and book a class without an account. Sign in to see your booking history, or if you are a trainer or studio admin.
          </Text>
          <View style={{ height: spacing.md }} />
          <Button title="Sign in" onPress={() => router.push("/(auth)/login")} />
        </View>
      )}

      <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>App</Text>
        <UpdateButton />
      </View>

      {user && <Button title="Sign out" variant="secondary" onPress={signOut} />}
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
