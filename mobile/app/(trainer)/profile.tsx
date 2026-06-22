import { useEffect, useState } from "react"
import { View, StyleSheet, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useAuth } from "@/lib/auth"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { Button } from "@/components/ui/Button"
import { UpdateButton } from "@/components/UpdateButton"
import { api } from "@/lib/api"

type NotifMode = "SOUND_VIBRATION" | "VIBRATION_ONLY" | "SOUND_ONLY"

const NOTIF_OPTIONS: { value: NotifMode; label: string; sub: string }[] = [
  { value: "SOUND_VIBRATION", label: "Sound + Vibration", sub: "Audible + buzz" },
  { value: "VIBRATION_ONLY", label: "Vibration only",    sub: "Silent buzz" },
  { value: "SOUND_ONLY",     label: "Sound only",         sub: "No vibration" },
]

export default function TrainerProfileTab() {
  const { theme } = useTheme()
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const [notifMode, setNotifMode] = useState<NotifMode>("SOUND_VIBRATION")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<{ chatNotifMode: NotifMode }>("/api/push/settings")
      .then((r) => setNotifMode(r.chatNotifMode))
      .catch(() => {})
  }, [])

  const saveMode = async (mode: NotifMode) => {
    setNotifMode(mode)
    setSaving(true)
    try {
      await api("/api/push/settings", { method: "PATCH", body: { chatNotifMode: mode } })
    } catch { /* no-op */ } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: spacing.xl, gap: spacing.lg }} edges={["top", "bottom"]}>
      <Text variant="title2" tone="primary">Profile</Text>

      <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
        <Text variant="caption" tone="muted">Signed in as</Text>
        <Text variant="headline" tone="primary" style={{ marginTop: 4 }}>{user?.email ?? "-"}</Text>
        <Text variant="footnote" tone="muted" style={{ marginTop: 2 }}>
          {(user?.role ?? "-").toLowerCase()} · {user?.studioSlug ?? "-"}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
          Chat notifications{saving ? "  saving..." : ""}
        </Text>
        {NOTIF_OPTIONS.map((opt) => {
          const active = notifMode === opt.value
          return (
            <Pressable
              key={opt.value}
              onPress={() => saveMode(opt.value)}
              style={[
                styles.notifRow,
                active && { backgroundColor: theme.bg.page },
                { borderRadius: radius.md },
              ]}
            >
              <View style={[styles.radio, { borderColor: active ? theme.brand.primary : theme.border.subtle }]}>
                {active && <View style={[styles.radioDot, { backgroundColor: theme.brand.primary }]} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="body" tone={active ? "brand" : "primary"}>{opt.label}</Text>
                <Text variant="footnote" tone="muted">{opt.sub}</Text>
              </View>
            </Pressable>
          )
        })}
      </View>

      <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
        <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>App</Text>
        <UpdateButton />
      </View>

      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, alignItems: "center", justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
})
