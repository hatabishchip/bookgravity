import { useState } from "react"
import { View, ScrollView, Pressable, StyleSheet, Linking, ActivityIndicator, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { ChevronLeft, Phone, CheckCircle2, Circle, Users, UserPlus, X } from "lucide-react-native"
import { useQuery } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { api } from "@/lib/api"

type ClassBooking = {
  id: string
  ticketCode: string
  clientName: string
  clientPhone: string
  clientEmail: string
  checkedIn: boolean
  paymentStatus: string
  services: { service: { id: string; name: string; price: number } }[]
  slot: { id: string; date: string; startTime: string; endTime: string; classType: string; maxCapacity: number }
}

export default function ClassScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const { slotId, date, startTime, endTime } = useLocalSearchParams<{ slotId?: string; date?: string; startTime?: string; endTime?: string }>()
  const id = slotId ?? ""

  const { data: bookings = [], isLoading, refetch, isRefetching } = useQuery<ClassBooking[]>({
    queryKey: ["trainer", "bookings", id],
    enabled: !!id,
    queryFn: () => api<ClassBooking[]>(`/api/trainer/bookings?slotId=${id}`),
    staleTime: 15_000,
  })

  const slot = bookings[0]?.slot
  const slotDate = (typeof date === "string" && date) || slot?.date
  const slotStart = slot?.startTime ?? (typeof startTime === "string" ? startTime : undefined)
  const slotEnd = slot?.endTime ?? (typeof endTime === "string" ? endTime : undefined)
  // Trainers can hand-add a client only to a class dated TODAY (even one whose
  // time already passed). Device-local date matches Bali for the studio; the
  // server re-checks the real Bali date anyway.
  const isToday = !!slotDate && slotDate === format(new Date(), "yyyy-MM-dd")

  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("+")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submitAdd = async () => {
    const cleanName = name.trim()
    const digits = phone.replace(/\D/g, "")
    if (!cleanName) { setErr("Enter a name"); return }
    if (digits.length < 6) { setErr("Enter a valid phone"); return }
    setSaving(true)
    setErr(null)
    try {
      await api(`/api/trainer/bookings`, { method: "POST", body: { slotId: id, clientName: cleanName, clientPhone: phone } })
      setAddOpen(false)
      setName("")
      setPhone("+")
      await refetch()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add the client")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.border.subtle }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 32 }}>
          <ChevronLeft size={24} color={theme.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" tone="primary">
            {slotDate ? format(parseISO(slotDate), "EEE, MMM d") : "Class"}
          </Text>
          {slotStart && (
            <Text variant="footnote" tone="muted">{slotStart} - {slotEnd}</Text>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.brand.primary} />}
      >
        {isToday && (
          <Pressable
            onPress={() => { setErr(null); setAddOpen(true) }}
            style={({ pressed }) => [
              styles.addBtn,
              { borderColor: theme.brand.primary, backgroundColor: theme.brand.primarySoft, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <UserPlus size={18} color={theme.brand.primary} />
            <Text variant="callout" tone="brand" style={{ fontWeight: "700" }}>Add a client</Text>
          </Pressable>
        )}
        {isLoading ? (
          <ActivityIndicator color={theme.brand.primary} style={{ marginTop: spacing.xl }} />
        ) : bookings.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
            <Users size={32} color={theme.text.muted} />
            <Text variant="headline" tone="primary" style={{ marginTop: spacing.sm }}>No bookings yet</Text>
            <Text variant="footnote" tone="muted" style={{ marginTop: 4 }}>
              Clients who book this class will show up here.
            </Text>
          </View>
        ) : (
          bookings.map((b) => <ClientRow key={b.id} booking={b} />)
        )}
      </ScrollView>

      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
            <View style={styles.modalHead}>
              <Text variant="headline" tone="primary">Add a client</Text>
              <Pressable onPress={() => setAddOpen(false)} hitSlop={10}>
                <X size={22} color={theme.text.muted} />
              </Pressable>
            </View>
            <Text variant="footnote" tone="muted" style={{ marginBottom: spacing.md }}>
              A manual record for today&apos;s class. The client gets no WhatsApp message.
            </Text>
            <TextInput
              placeholder="Client name"
              placeholderTextColor={theme.text.muted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              style={[styles.input, { color: theme.text.primary, borderColor: theme.border.subtle }]}
            />
            <TextInput
              placeholder="Phone (+62...)"
              placeholderTextColor={theme.text.muted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={[styles.input, { color: theme.text.primary, borderColor: theme.border.subtle }]}
            />
            {err && <Text variant="footnote" style={{ color: "#dc2626", marginTop: 2 }}>{err}</Text>}
            <Pressable
              onPress={submitAdd}
              disabled={saving}
              style={[styles.saveBtn, { backgroundColor: theme.brand.primary, opacity: saving ? 0.6 : 1 }]}
            >
              {saving ? (
                <ActivityIndicator color={theme.text.invert} />
              ) : (
                <Text variant="callout" style={{ color: theme.text.invert, fontWeight: "700" }}>Add to class</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

function ClientRow({ booking }: { booking: ClassBooking }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.row, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline" tone="primary">
          {(booking.clientName ?? "").replace(/\s*\(\d+\/\d+\)$/, "").trim()}
        </Text>
        <Pressable onPress={() => booking.clientPhone && Linking.openURL(`tel:${encodeURIComponent(booking.clientPhone)}`)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <Phone size={12} color={theme.text.secondary} />
            <Text variant="footnote" tone="secondary">{booking.clientPhone || "—"}</Text>
          </View>
        </Pressable>
        <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs }}>
          <View style={[styles.pill, { backgroundColor: theme.brand.primarySoft }]}>
            <Text style={{ color: theme.brand.primary, fontSize: 10, fontWeight: "700" }}>
              #{booking.ticketCode}
            </Text>
          </View>
          {booking.services.length > 0 && (
            <View style={[styles.pill, { backgroundColor: "rgba(217,119,6,0.12)" }]}>
              <Text style={{ color: theme.brand.accentAmber, fontSize: 10, fontWeight: "700" }}>
                +{booking.services.length} svc
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ alignItems: "center", gap: 2 }}>
        {booking.checkedIn ? (
          <CheckCircle2 size={28} color={theme.brand.primary} />
        ) : (
          <Circle size={28} color={theme.text.muted} />
        )}
        <Text variant="caption" tone={booking.checkedIn ? "brand" : "muted"}>
          {booking.checkedIn ? "Checked in" : "Pending"}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  empty: {
    alignItems: "center",
    paddingVertical: spacing["3xl"],
    paddingHorizontal: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  modalWrap: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    padding: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.sm,
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  saveBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
})
