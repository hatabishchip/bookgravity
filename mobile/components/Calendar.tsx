import { useMemo, useState, useEffect } from "react"
import { View, Pressable, StyleSheet, ActivityIndicator } from "react-native"
import { ChevronLeft, ChevronRight } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import {
  addMonths, format, isSameDay, isAfter, isBefore, isToday,
  monthGridDays, monthKey, prettyMonth, startOfMonth, ymd,
} from "@/lib/dates"
import { spacing, radius } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import type { PublicSlot } from "@shared/types"

type Props = {
  slots: PublicSlot[]
  loading: boolean
  selected: Date | null
  onSelect: (d: Date) => void
  partySize?: number
}

// Native version of the web BookingWidget's month calendar. Same color
// language: green dot = available, rose = fully booked, gray = past
// class. Empty months get skipped on prev/next, and the calendar
// auto-jumps to the nearest month with bookable dates on first load.
export function Calendar({ slots, loading, selected, onSelect, partySize = 1 }: Props) {
  const { theme } = useTheme()
  const today = useMemo(() => new Date(), [])
  const todayStr = ymd(today)

  // Reduce slot data into the three sets used for dot coloring.
  const { availableDates, fullyBookedDates, pastDates, monthsWithBookable } = useMemo(() => {
    const avail = new Set<string>()
    const full = new Set<string>()
    const past = new Set<string>()
    for (const s of slots) {
      if (s.date < todayStr) {
        past.add(s.date)
        continue
      }
      if (s.bookable === false) continue
      const seats = s.maxCapacity - s.bookedCount
      if (seats >= partySize) avail.add(s.date)
    }
    for (const s of slots) {
      if (s.date < todayStr) continue
      if (s.bookable === false) continue
      if (!avail.has(s.date)) full.add(s.date)
    }
    const months = new Set<string>()
    for (const d of avail) months.add(d.slice(0, 7))
    return {
      availableDates: avail,
      fullyBookedDates: full,
      pastDates: past,
      monthsWithBookable: months,
    }
  }, [slots, partySize, todayStr])

  const sortedBookableMonths = useMemo(() => Array.from(monthsWithBookable).sort(), [monthsWithBookable])
  const hasAnyBookable = sortedBookableMonths.length > 0

  const [cursor, setCursor] = useState<Date>(today)
  const cursorKey = monthKey(cursor)
  const todayKey = monthKey(today)

  // Jump to the nearest future month with bookable dates as soon as data lands.
  useEffect(() => {
    if (!slots.length) return
    if (monthsWithBookable.has(cursorKey)) return
    const next = sortedBookableMonths.find((k) => k >= todayKey)
    if (!next) return
    const [y, m] = next.split("-").map(Number)
    setCursor(new Date(y, m - 1, 1))
  }, [slots.length, cursorKey, todayKey, monthsWithBookable, sortedBookableMonths])

  const days = useMemo(() => monthGridDays(cursor), [cursor])
  const prevKey = sortedBookableMonths.filter((k) => k < cursorKey).pop()
  const nextKey = sortedBookableMonths.find((k) => k > cursorKey)

  const goPrev = () => {
    if (!prevKey) return
    const [y, m] = prevKey.split("-").map(Number)
    setCursor(new Date(y, m - 1, 1))
    Haptics.selectionAsync()
  }
  const goNext = () => {
    if (!nextKey) return
    const [y, m] = nextKey.split("-").map(Number)
    setCursor(new Date(y, m - 1, 1))
    Haptics.selectionAsync()
  }

  if (loading && slots.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
        <View style={styles.headerRow}>
          <View style={[styles.skel, { backgroundColor: theme.border.subtle }]} />
          <View style={[styles.skelLabel, { backgroundColor: theme.border.subtle }]} />
          <View style={[styles.skel, { backgroundColor: theme.border.subtle }]} />
        </View>
        <ActivityIndicator color={theme.brand.primary} style={{ marginTop: spacing["3xl"] }} />
      </View>
    )
  }

  if (!hasAnyBookable) {
    return (
      <View style={[styles.card, styles.emptyCard, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
        <Text variant="title3" tone="brand">📅</Text>
        <Text variant="headline" tone="primary" style={{ marginTop: spacing.sm }}>
          Нет доступных дат для букирования
        </Text>
        <Text variant="footnote" tone="muted" style={{ marginTop: spacing.xs, textAlign: "center" }}>
          Похоже, расписание ещё не опубликовано. Загляните чуть позже или напишите нам.
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.bg.card, borderColor: theme.border.subtle }]}>
      {/* Month header */}
      <View style={styles.headerRow}>
        <Pressable onPress={goPrev} disabled={!prevKey} style={[styles.navBtn, !prevKey && { opacity: 0.25 }]} hitSlop={8}>
          <ChevronLeft size={22} color={theme.text.primary} />
        </Pressable>
        <Text variant="headline" tone="primary">{prettyMonth(cursor)}</Text>
        <Pressable onPress={goNext} disabled={!nextKey} style={[styles.navBtn, !nextKey && { opacity: 0.25 }]} hitSlop={8}>
          <ChevronRight size={22} color={theme.text.primary} />
        </Pressable>
      </View>

      {/* Weekday strip */}
      <View style={styles.weekRow}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <View key={d} style={styles.weekCell}>
            <Text variant="caption" tone="muted">{d}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View style={styles.grid}>
        {days.map((day) => {
          const str = ymd(day)
          const outOfMonth = day.getMonth() !== cursor.getMonth()
          const isPast = isBefore(day, today) && !isToday(day)
          const hasSlot = availableDates.has(str)
          const isFull = fullyBookedDates.has(str)
          const hadPast = pastDates.has(str)
          const isSel = selected ? isSameDay(day, selected) : false
          const clickable = hasSlot && !isPast

          const dotColor = isSel ? null :
            clickable ? theme.brand.primary :
            isFull && !isPast ? theme.brand.accentRose :
            isPast && hadPast ? theme.text.muted :
            null

          const cellBg = isSel ? theme.brand.primary :
            "transparent"
          const cellFg = isSel ? theme.text.invert :
            outOfMonth ? theme.text.muted :
            clickable ? theme.text.primary :
            isPast ? theme.text.muted :
            theme.text.secondary

          return (
            <Pressable
              key={str}
              disabled={!clickable}
              onPress={() => {
                Haptics.selectionAsync()
                onSelect(day)
              }}
              style={[styles.dayCell, { backgroundColor: cellBg }]}
            >
              <Text style={{ color: cellFg, fontSize: 15, fontWeight: isToday(day) ? "700" : "500" }}>
                {day.getDate()}
              </Text>
              <View style={styles.dotRow}>
                {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
              </View>
            </Pressable>
          )
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendDot color={theme.brand.primary} label="Available" theme={theme} />
        <LegendDot color={theme.brand.accentRose} label="Booked" theme={theme} />
        <LegendDot color={theme.text.muted} label="Past" theme={theme} />
      </View>
    </View>
  )
}

function LegendDot({ color, label, theme }: { color: string; label: string; theme: ReturnType<typeof useTheme>["theme"] }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="footnote" tone="muted">{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: spacing["3xl"],
    paddingHorizontal: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: spacing.xs,
  },
  weekCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    gap: 2,
  },
  dotRow: {
    height: 6,
    justifyContent: "center",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.lg,
    marginTop: spacing.lg,
    paddingTop: spacing.sm,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  skel: { width: 36, height: 36, borderRadius: 18 },
  skelLabel: { width: 120, height: 20, borderRadius: 4 },
})
