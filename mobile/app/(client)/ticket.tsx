import { useMemo } from "react"
import { View, ScrollView, Pressable, StyleSheet, Share } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { ChevronLeft, Share2 } from "lucide-react-native"
import QRCode from "react-native-qrcode-svg"
import { format, parseISO } from "date-fns"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { useMyBookings } from "@/hooks/useMyBookings"

// Ticket detail screen — large rendered QR + booking details. The trainer's
// app scans this QR (in phase 2.4) to call /api/trainer/bookings/verify.
export default function TicketScreen() {
  const { theme } = useTheme()
  const params = useLocalSearchParams<{ id?: string }>()
  const router = useRouter()
  const { data: bookings = [] } = useMyBookings()
  const booking = useMemo(() => bookings.find((b) => b.id === params.id), [bookings, params.id])

  const onShare = async () => {
    if (!booking) return
    try {
      await Share.share({
        message: `My Gravity Stretching booking — #${booking.ticketCode} on ${format(parseISO(booking.slot.date), "EEEE, MMMM d")} at ${booking.slot.startTime}.`,
      })
    } catch { /* user dismissed */ }
  }

  if (!booking) {
    return (
      <SafeAreaView style={{ flex: 1, padding: spacing.xl }} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="body" tone="muted">Ticket not found.</Text>
        <Pressable onPress={() => router.back()}><Text tone="brand">← Back</Text></Pressable>
      </SafeAreaView>
    )
  }

  // QR payload — encodes bookingId + code so the trainer's verify endpoint
  // can match them in one round trip without first looking up the code.
  const qrPayload = JSON.stringify({
    v: 1,
    type: "gs-ticket",
    bookingId: booking.id,
    code: booking.ticketCode,
  })

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.border.subtle }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 32 }}>
          <ChevronLeft size={24} color={theme.text.primary} />
        </Pressable>
        <Text variant="headline" tone="primary" style={{ flex: 1 }}>Your ticket</Text>
        <Pressable onPress={onShare} hitSlop={10} style={{ width: 32, alignItems: "flex-end" }}>
          <Share2 size={20} color={theme.text.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, alignItems: "center", gap: spacing.lg }}>
        {/* The QR card. White background even in dark mode — scanners need
            high contrast and the studio's room may not be well-lit. */}
        <View style={styles.qrCard}>
          <QRCode value={qrPayload} size={232} color="#000000" backgroundColor="#FFFFFF" />
          <View style={{ marginTop: spacing.md, alignItems: "center" }}>
            <Text variant="caption" style={{ color: "#666" }}>TICKET CODE</Text>
            <Text style={{ fontSize: 36, fontWeight: "700", color: "#0A0A0A", letterSpacing: 6, marginTop: 4 }}>
              #{booking.ticketCode}
            </Text>
          </View>
        </View>

        {/* Booking detail card */}
        <View style={[styles.detail, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          <Row label="Date" value={format(parseISO(booking.slot.date), "EEEE, MMMM d, yyyy")} theme={theme} />
          <Row label="Time" value={`${booking.slot.startTime} – ${booking.slot.endTime}`} theme={theme} />
          <Row label="Class" value={(booking.slot.classType ?? "GROUP")[0] + (booking.slot.classType ?? "GROUP").slice(1).toLowerCase()} theme={theme} />
          {booking.slot.trainer && (
            <Row label="Trainer" value={booking.slot.trainer.name} theme={theme} />
          )}
          <Row label="Studio" value={booking.slot.studio.name} theme={theme} last />
        </View>

        <Text variant="footnote" tone="muted" style={{ textAlign: "center", paddingHorizontal: spacing.lg }}>
          Show this code at the studio. Please arrive 10 minutes before the class starts.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function Row({ label, value, theme, last }: { label: string; value: string; theme: ReturnType<typeof useTheme>["theme"]; last?: boolean }) {
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border.subtle }]}>
      <Text variant="caption" tone="muted">{label.toUpperCase()}</Text>
      <Text variant="callout" tone="primary" style={{ marginTop: 2 }}>{value}</Text>
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
  qrCard: {
    backgroundColor: "#FFFFFF",
    padding: spacing["2xl"],
    borderRadius: radius.xl,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  detail: {
    width: "100%",
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  row: {
    paddingVertical: spacing.md,
  },
})
