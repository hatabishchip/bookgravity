import { View, ScrollView, Pressable, RefreshControl, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { format, parseISO, isAfter, startOfDay } from "date-fns"
import { Ticket as TicketIcon, ChevronRight } from "lucide-react-native"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { Button } from "@/components/ui/Button"
import { useAuth } from "@/lib/auth"
import { useMyBookings } from "@/hooks/useMyBookings"
import type { Booking } from "@shared/types"

export default function BookingsTab() {
  const { theme } = useTheme()
  const router = useRouter()
  const user = useAuth((s) => s.user)
  const { data: bookings = [], isLoading, refetch, isRefetching } = useMyBookings(!!user)

  // Guests book without an account, so booking history lives behind sign-in.
  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, padding: spacing.lg, gap: spacing.lg }} edges={["top"]}>
        <Text variant="title2" tone="primary">Your tickets</Text>
        <View style={[styles.empty, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          <TicketIcon size={32} color={theme.brand.primary} />
          <Text variant="headline" tone="primary" style={{ marginTop: spacing.sm }}>Sign in to see your tickets</Text>
          <Text variant="footnote" tone="muted" style={{ marginTop: spacing.xs, textAlign: "center" }}>
            After you book, your QR ticket is shown right away. Sign in to keep your booking history here.
          </Text>
          <View style={{ height: spacing.md }} />
          <Button title="Sign in" onPress={() => router.push("/(auth)/login")} />
        </View>
      </SafeAreaView>
    )
  }

  const today = startOfDay(new Date())
  const upcoming = bookings.filter((b) => b.status === "CONFIRMED" && isAfter(parseISO(b.slot.date), today) || (b.status === "CONFIRMED" && parseISO(b.slot.date).toDateString() === today.toDateString()))
  const past = bookings.filter((b) => !upcoming.includes(b))

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.brand.primary} />}
      >
        <Text variant="title2" tone="primary">Your tickets</Text>
        <Text variant="subhead" tone="muted">Tap a ticket to show the QR at the studio.</Text>

        {isLoading ? (
          <SkeletonList />
        ) : bookings.length === 0 ? (
          <Empty />
        ) : (
          <>
            {upcoming.length > 0 && (
              <View>
                <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>UPCOMING</Text>
                <View style={{ gap: spacing.sm }}>
                  {upcoming.map((b) => (
                    <BookingCard key={b.id} booking={b} onPress={() => router.push({ pathname: "/(client)/ticket", params: { id: b.id } })} />
                  ))}
                </View>
              </View>
            )}
            {past.length > 0 && (
              <View>
                <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>PAST</Text>
                <View style={{ gap: spacing.sm }}>
                  {past.map((b) => (
                    <BookingCard key={b.id} booking={b} onPress={() => router.push({ pathname: "/(client)/ticket", params: { id: b.id } })} muted />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function BookingCard({ booking, onPress, muted }: { booking: Booking; onPress: () => void; muted?: boolean }) {
  const { theme } = useTheme()
  const typeBg =
    booking.slot.classType === "KIDS" ? "rgba(217,119,6,0.12)" :
    booking.slot.classType === "PRIVATE" ? "rgba(124,58,237,0.12)" :
    theme.brand.primarySoft
  const typeFg =
    booking.slot.classType === "KIDS" ? theme.brand.accentAmber :
    booking.slot.classType === "PRIVATE" ? theme.brand.accentPurple :
    theme.brand.primary
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.bg.card,
          borderColor: theme.border.subtle,
          opacity: muted ? 0.7 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text variant="headline" tone="primary">
          {format(parseISO(booking.slot.date), "EEE, MMM d")} · {booking.slot.startTime}
        </Text>
        <Text variant="footnote" tone="muted" style={{ marginTop: 2 }}>
          {booking.slot.trainer?.name ?? "—"} · {booking.slot.studio.name}
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs }}>
          <View style={[styles.pill, { backgroundColor: typeBg }]}>
            <Text style={{ color: typeFg, fontSize: 10, fontWeight: "700" }}>
              {(booking.slot.classType ?? "GROUP").toUpperCase()}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: theme.brand.primarySoft }]}>
            <Text style={{ color: theme.brand.primary, fontSize: 10, fontWeight: "700" }}>
              #{booking.ticketCode}
            </Text>
          </View>
        </View>
      </View>
      <ChevronRight size={18} color={theme.text.muted} />
    </Pressable>
  )
}

function Empty() {
  const { theme } = useTheme()
  return (
    <View style={[styles.empty, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
      <TicketIcon size={32} color={theme.brand.primary} />
      <Text variant="headline" tone="primary" style={{ marginTop: spacing.sm }}>No tickets yet</Text>
      <Text variant="footnote" tone="muted" style={{ marginTop: spacing.xs, textAlign: "center" }}>
        Book a class from the Book tab to see your QR ticket here.
      </Text>
    </View>
  )
}

function SkeletonList() {
  const { theme } = useTheme()
  return (
    <View style={{ gap: spacing.sm }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle, height: 92 }]} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
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
