import { View, ScrollView, Pressable, StyleSheet, Linking, ActivityIndicator, RefreshControl } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { ChevronLeft, Phone, CheckCircle2, Circle, Users } from "lucide-react-native"
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
  const { slotId } = useLocalSearchParams<{ slotId?: string }>()
  const id = slotId ?? ""

  const { data: bookings = [], isLoading, refetch, isRefetching } = useQuery<ClassBooking[]>({
    queryKey: ["trainer", "bookings", id],
    enabled: !!id,
    queryFn: () => api<ClassBooking[]>(`/api/trainer/bookings?slotId=${id}`),
    staleTime: 15_000,
  })

  const slot = bookings[0]?.slot

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.border.subtle }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 32 }}>
          <ChevronLeft size={24} color={theme.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" tone="primary">
            {slot ? format(parseISO(slot.date), "EEE, MMM d") : "Class"}
          </Text>
          {slot && (
            <Text variant="footnote" tone="muted">{slot.startTime} – {slot.endTime}</Text>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.brand.primary} />}
      >
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
})
