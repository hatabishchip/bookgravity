import { useCallback, useEffect, useState } from "react"
import { View, Pressable, AppState, Linking, Platform } from "react-native"
import * as Notifications from "expo-notifications"
import * as SecureStore from "expo-secure-store"
import { useAuth } from "@/lib/auth"
import { registerPushToken } from "@/lib/push"
import { api } from "@/lib/api"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"

// Profile > Notifications: shows how notifications actually arrive on THIS
// device right now (owner request 09.07) - the OS permission, whether the
// device is registered for push, the chat sound mode (staff, stored
// server-side), and which kinds of notifications the signed-in role gets.

type PermStatus = "granted" | "denied" | "undetermined" | "unknown"
type ChatMode = "SOUND_VIBRATION" | "VIBRATION_ONLY" | "SOUND_ONLY"

const MODES: { value: ChatMode; label: string }[] = [
  { value: "SOUND_VIBRATION", label: "Sound + vibration" },
  { value: "VIBRATION_ONLY", label: "Vibration" },
  { value: "SOUND_ONLY", label: "Sound" },
]

function StatusPill({ ok, label }: { ok: boolean | null; label: string }) {
  const bg = ok === null ? "#9CA3AF22" : ok ? "#10B98122" : "#EF444422"
  const fg = ok === null ? "#6B7280" : ok ? "#047857" : "#B91C1C"
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  )
}

export function NotificationSettings() {
  const { theme } = useTheme()
  const user = useAuth((s) => s.user)
  const [perm, setPerm] = useState<PermStatus>("unknown")
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [chatMode, setChatMode] = useState<ChatMode | null>(null)

  const refresh = useCallback(async () => {
    try {
      const p = await Notifications.getPermissionsAsync()
      setPerm(p.status as PermStatus)
    } catch {
      setPerm("unknown")
    }
    try {
      setRegistered(!!(await SecureStore.getItemAsync("gs.push.lastToken")))
    } catch {
      setRegistered(null)
    }
    if (useAuth.getState().user) {
      try {
        const s = await api<{ chatNotifMode: ChatMode }>("/api/push/settings")
        setChatMode(s.chatNotifMode)
      } catch {
        setChatMode(null)
      }
    }
  }, [])

  // Re-check when the user comes back from the system settings screen.
  useEffect(() => {
    void refresh()
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh()
    })
    return () => sub.remove()
  }, [refresh])

  const enable = async () => {
    await registerPushToken()
    await refresh()
  }

  const setMode = async (m: ChatMode) => {
    setChatMode(m)
    try {
      await api("/api/push/settings", { method: "PATCH", body: { chatNotifMode: m } })
    } catch {
      void refresh()
    }
  }

  const role = user?.role
  const isStaff = role === "ADMIN" || role === "SUPER_ADMIN" || role === "TRAINER"
  const receives: string[] = !user
    ? ["Sign in to receive notifications on this device."]
    : role === "TRAINER"
      ? ["New bookings in your classes", "Client messages in your chats"]
      : isStaff
        ? ["New bookings in the studio", "Client messages in the studio inbox"]
        : ["Booking confirmations and class reminders arrive in WhatsApp, not as push."]

  return (
    <View style={{ gap: spacing.md }}>
      {/* OS permission */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="footnote" tone="secondary">System permission</Text>
        <StatusPill
          ok={perm === "granted" ? true : perm === "unknown" ? null : false}
          label={perm === "granted" ? "Allowed" : perm === "denied" ? "Blocked" : perm === "undetermined" ? "Not asked yet" : "Unknown"}
        />
      </View>

      {/* Device registration */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="footnote" tone="secondary">Push on this device</Text>
        <StatusPill
          ok={registered}
          label={registered ? (Platform.OS === "android" ? "Active (FCM)" : "Active (APNs)") : "Not registered"}
        />
      </View>

      {/* Fix-it action, only when something needs fixing. */}
      {perm === "denied" ? (
        <Pressable
          onPress={() => Linking.openSettings().catch(() => {})}
          style={{ paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: theme.brand.primary, alignItems: "center" }}
        >
          <Text variant="footnote" tone="brand" style={{ fontWeight: "600" }}>
            Notifications are blocked - open system settings
          </Text>
        </Pressable>
      ) : perm !== "granted" || registered === false ? (
        <Pressable
          onPress={enable}
          style={{ paddingVertical: 10, borderRadius: radius.md, backgroundColor: theme.brand.primary, alignItems: "center" }}
        >
          <Text variant="footnote" style={{ color: "#fff", fontWeight: "600" }}>Enable notifications</Text>
        </Pressable>
      ) : null}

      {/* Chat alert mode - staff only (stored on the server per user). */}
      {isStaff && chatMode && (
        <View>
          <Text variant="footnote" tone="secondary" style={{ marginBottom: spacing.xs }}>
            Client message alerts
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            {MODES.map((m) => (
              <Pressable
                key={m.value}
                onPress={() => setMode(m.value)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  alignItems: "center",
                  borderColor: chatMode === m.value ? theme.brand.primary : theme.border.subtle,
                  backgroundColor: chatMode === m.value ? theme.brand.primarySoft : "transparent",
                }}
              >
                <Text
                  style={{ fontSize: 11, fontWeight: "600" }}
                  tone={chatMode === m.value ? "brand" : "secondary"}
                >
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* What arrives for this role. */}
      <View>
        <Text variant="footnote" tone="secondary" style={{ marginBottom: 2 }}>You receive</Text>
        {receives.map((line) => (
          <Text key={line} variant="footnote" tone="muted" style={{ marginTop: 2 }}>
            {"•"} {line}
          </Text>
        ))}
      </View>
    </View>
  )
}
