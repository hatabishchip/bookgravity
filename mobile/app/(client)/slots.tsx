import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { ChevronLeft, Users } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { useDateSlots } from "@/hooks/useSlots"
import { format, parseISO } from "date-fns"
import type { PublicSlot } from "@shared/types"

// Lazy-route screen pushed from the calendar. URL param is yyyy-MM-dd.
// Lists the slots Meta says are still bookable on that day, color-coded
// by class type (Group / Kids / Private). Tap → booking confirmation.
export default function SlotsScreen() {
  const { theme } = useTheme()
  const params = useLocalSearchParams<{ date?: string }>()
  const router = useRouter()
  const date = params.date ?? ""
  const { data: slots = [], isLoading } = useDateSlots(date)

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom header */}
      <View style={[styles.header, { borderBottomColor: theme.border.subtle }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ChevronLeft size={24} color={theme.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" tone="primary">
            {date ? format(parseISO(date), "EEEE") : ""}
          </Text>
          <Text variant="footnote" tone="muted">
            {date ? format(parseISO(date), "MMMM d, yyyy") : ""}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
        {isLoading ? (
          <ActivityIndicator color={theme.brand.primary} style={{ marginTop: spacing["3xl"] }} />
        ) : slots.length === 0 ? (
          <EmptyDay />
        ) : (
          slots.map((slot) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              onPress={() => router.push({ pathname: "/(client)/book", params: { slotId: slot.id } })}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function SlotRow({ slot, onPress }: { slot: PublicSlot; onPress: () => void }) {
  const { theme } = useTheme()
  const left = slot.maxCapacity - slot.bookedCount
  const isFull = left <= 0

  const typeLabel = slot.classType === "PRIVATE" ? "Private" : slot.classType === "KIDS" ? "Kids" : "Group"
  const typeBg =
    slot.classType === "KIDS" ? "rgba(217,119,6,0.12)" :
    slot.classType === "PRIVATE" ? "rgba(124,58,237,0.12)" :
    theme.brand.primarySoft
  const typeFg =
    slot.classType === "KIDS" ? theme.brand.accentAmber :
    slot.classType === "PRIVATE" ? theme.brand.accentPurple :
    theme.brand.primary

  return (
    <Pressable
      onPress={() => { if (!isFull) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress() } }}
      disabled={isFull}
      style={({ pressed }) => [
        styles.slotRow,
        {
          backgroundColor: isFull ? theme.bg.elevated : theme.bg.card,
          borderColor: theme.border.subtle,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.slotLeft}>
        <Text variant="title3" tone="primary">{slot.startTime}</Text>
        <Text variant="footnote" tone="muted">→ {slot.endTime}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.typePill, { backgroundColor: typeBg }]}>
          <Text style={{ color: typeFg, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>
            {typeLabel.toUpperCase()}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Users size={12} color={theme.text.muted} />
          <Text variant="footnote" tone={isFull ? "danger" : "muted"}>
            {isFull ? "Sold out" : `${left} of ${slot.maxCapacity} spots left`}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

function EmptyDay() {
  const { theme } = useTheme()
  return (
    <View style={[styles.empty, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
      <Text variant="callout" tone="brand">⏳</Text>
      <Text variant="headline" tone="primary" style={{ marginTop: spacing.sm }}>
        No bookable slots
      </Text>
      <Text variant="footnote" tone="muted" style={{ marginTop: spacing.xs, textAlign: "center" }}>
        Bookings for this day are closed or all spots are filled. Try another day.
      </Text>
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
  backBtn: { width: 32, alignItems: "flex-start" },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  slotLeft: {
    width: 70,
  },
  typePill: {
    alignSelf: "flex-start",
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
    marginTop: spacing.lg,
  },
})
