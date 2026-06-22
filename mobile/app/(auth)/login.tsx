import { useState } from "react"
import { View, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native"
import { useRouter } from "expo-router"
import { useAuth, homeRouteFor } from "@/lib/auth"
import { ApiError } from "@/lib/api"
import { useTheme } from "@/hooks/useTheme"
import { spacing } from "@/lib/theme"
import { Text } from "@/components/ui/Text"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

export default function LoginScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const signIn = useAuth((s) => s.signIn)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const user = await signIn(email.trim(), password)
      router.replace(homeRouteFor(user.role))
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 401 ? "Invalid email or password" :
        e instanceof Error ? e.message : "Sign-in failed"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, { backgroundColor: theme.bg.page }]}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.heroBlock}>
          <Text variant="title2" tone="brand" style={{ textAlign: "center" }}>Gravity Stretching</Text>
          <Text variant="subhead" tone="muted" style={{ textAlign: "center", marginTop: spacing.xs }}>
            Sign in to your account
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          <Text variant="headline" tone="primary" style={{ marginBottom: spacing.md }}>Welcome back</Text>

          <Input
            label="Email or username"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@studio.com"
          />

          <View style={{ height: spacing.md }} />

          <Input
            label="Password"
            secureTextEntry
            autoComplete="off"
            importantForAutofill="no"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            onSubmitEditing={submit}
            returnKeyType="go"
          />

          {error && (
            <View style={[styles.errorBox, { backgroundColor: "rgba(220,38,38,0.08)", borderColor: theme.status.danger }]}>
              <Text variant="footnote" tone="danger">{error}</Text>
            </View>
          )}

          <View style={{ height: spacing.lg }} />

          <Button title="Sign In" onPress={submit} loading={loading} disabled={!email || !password} />
        </View>

        <Text variant="footnote" tone="muted" style={styles.disclaimer}>
          Use the same email and password as the web admin / trainer dashboard.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing["3xl"],
    paddingBottom: spacing.xl,
    justifyContent: "center",
  },
  heroBlock: { marginBottom: spacing["2xl"] },
  card: {
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
  },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  disclaimer: {
    textAlign: "center",
    marginTop: spacing["2xl"],
  },
})
