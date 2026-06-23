import { useMemo, useState } from "react"
import { View, ScrollView, RefreshControl, Pressable, StyleSheet, Image } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { format, addDays, parseISO, startOfWeek } from "date-fns"
import { Users, ChevronRight } from "lucide-react-native"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { useTrainerSchedule, type TrainerSlot } from "@/hooks/useTrainerSchedule"
import { useAuth } from "@/lib/auth"

// Trainer's home: a segmented Today / Week / Upcoming switch over the same
// /api/trainer/schedule endpoint the web dashboard uses. Each card opens
// the class detail screen (clients on that class) on tap. Other trainers'
// slots and unassigned slots render with reduced detail.
export default function TrainerScheduleTab() {
  const { theme } = useTheme()
  const router = useRouter()
  const studioLogoUrl = useAuth((s) => s.user?.studioLogoUrl)
  const [view, setView] = useState<"today" | "week" | "upcoming">("today")
  const todayStr = format(new Date(), "yyyy-MM-dd")

  const range = useMemo(() => {
    if (view === "today") return { from: todayStr, to: todayStr }
    if (view === "week") {
      const start = startOfWeek(new Date(), { weekStartsOn: 1 })
      const end = addDays(start, 6)
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") }
    }
    return { from: todayStr, to: format(addDays(new Date(), 30), "yyyy-MM-dd") }
  }, [view, todayStr])

  const { data: slots = [], isLoading, refetch, isRefetching } = useTrainerSchedule(range.from, range.to)
  const myClasses = slots.filter((s): s is Extract<TrainerSlot, { state: "mine" }> => s.state === "mine")

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.brand.primary} />}
      >
        {studioLogoUrl ? (
          <Image
            source={{ uri: studioLogoUrl }}
            style={{ height: 48, width: 160, resizeMode: "contain", alignSelf: "flex-start" }}
          />
        ) : (
          <Text variant="title2" tone="primary">Your schedule</Text>
        )}

        {/* Segmented switcher */}
        <View style={[styles.seg, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
          {(["today", "week", "upcoming"] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              style={[
                styles.segItem,
                view === v && { backgroundColor: theme.brand.primary },
              ]}
            >
              <Text style={{ color: view === v ? theme.text.invert : theme.text.secondary, fontWeight: "600", fontSize: 13 }}>
                {v[0].toUpperCase() + v.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Counts */}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Stat label="Mine" value={myClasses.length} primary />
          <Stat label="Confirmed" value={myClasses.reduce((acc, s) => acc + (s._count?.bookings ?? 0), 0)} />
        </View>

        {/* Slot list — only "mine" rendered as actionable; others stay flat. */}
        {isLoading ? <Skeleton /> : myClasses.length === 0 ? (
          <Empty view={view} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {myClasses.map((slot) => (
              <Pressable
                key={slot.id}
                onPress={() => router.push({ pathname: "/(trainer)/class", params: { slotId: slot.id } })}
                style={({ pressed }) => [
                  styles.classRow,
                  { backgroundColor: theme.bg.card, borderColor: theme.border.subtle, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={[styles.timeBlock, { backgroundColor: theme.brand.primarySoft }]}>
                  <Text variant="callout" tone="brand">{slot.startTime}</Text>
                  <Text variant="footnote" tone="muted">{slot.endTime}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="headline" tone="primary">
                    {format(parseISO(slot.date), "EEE, MMM d")}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Users size={12} color={theme.text.muted} />
                    <Text variant="footnote" tone="muted">
                      {slot._count.bookings} / {slot.maxCapacity} confirmed
                    </Text>
                  </View>
                </View>
                <ChevronRight size={18} color={theme.text.muted} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Stat({ label, value, primary }: { label: string; value: number; primary?: boolean }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.stat, { backgroundColor: primary ? theme.brand.primarySoft : theme.bg.card, borderColor: theme.border.subtle }]}>
      <Text variant="caption" tone={primary ? "brand" : "muted"}>{label.toUpperCase()}</Text>
      <Text variant="title3" tone={primary ? "brand" : "primary"} style={{ marginTop: 2 }}>{value}</Text>
    </View>
  )
}

function Empty({ view }: { view: "today" | "week" | "upcoming" }) {
  const { theme } = useTheme()
  const message =
    view === "today" ? "No classes today — enjoy the day off." :
    view === "week" ? "Nothing scheduled for this week yet." :
    "No upcoming classes in the next month."
  return (
    <View style={[styles.empty, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
      <Text variant="callout" tone="brand">📆</Text>
      <Text variant="headline" tone="primary" style={{ marginTop: spacing.sm }}>{message}</Text>
    </View>
  )
}

function Skeleton() {
  const { theme } = useTheme()
  return (
    <View style={{ gap: spacing.sm }}>
      {[1, 2].map((i) => (
        <View key={i} style={[styles.classRow, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle, height: 80 }]} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 4,
  },
  segItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  stat: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  timeBlock: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    gap: 2,
  },
  empty: {
    alignItems: "center",
    paddingVertical: spacing["3xl"],
    paddingHorizontal: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
})
