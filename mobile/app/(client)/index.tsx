import { useState } from "react"
import { ScrollView, RefreshControl, StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { spacing } from "@/lib/theme"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { Calendar } from "@/components/Calendar"
import { useMonthSlots } from "@/hooks/useSlots"
import { useRouter } from "expo-router"
import { ymd } from "@/lib/dates"

export default function CalendarTab() {
  const { theme } = useTheme()
  const { data: slots = [], isLoading, refetch, isRefetching } = useMonthSlots()
  const [selected, setSelected] = useState<Date | null>(null)
  const router = useRouter()

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.brand.primary}
          />
        }
      >
        <Text variant="title2" tone="primary">Book a class</Text>
        <Text variant="subhead" tone="muted">
          Pick a date with a green dot to see available time slots.
        </Text>

        <Calendar
          slots={slots}
          loading={isLoading}
          selected={selected}
          onSelect={(d) => {
            setSelected(d)
            // Push to time-picker screen with the selected date
            router.push({ pathname: "/(client)/slots", params: { date: ymd(d) } })
          }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({})
