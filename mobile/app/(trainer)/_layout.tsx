import { useEffect, useState } from "react"
import { View } from "react-native"
import { Tabs } from "expo-router"
import { CalendarDays, ScanLine, Banknote, MessageSquare, User } from "lucide-react-native"
import { useTheme } from "@/hooks/useTheme"
import { Text } from "@/components/ui/Text"
import { api } from "@/lib/api"

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <View style={{
      position: "absolute", top: -4, right: -8,
      minWidth: 16, height: 16, borderRadius: 8,
      backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center",
      paddingHorizontal: 3,
    }}>
      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 12 }}>
        {count > 99 ? "99+" : String(count)}
      </Text>
    </View>
  )
}

export default function TrainerTabsLayout() {
  const { theme } = useTheme()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await api<{ unread: number }>("/api/push/unread")
        setUnread(res.unread)
      } catch { /* offline */ }
    }
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brand.primary,
        tabBarInactiveTintColor: theme.text.muted,
        tabBarStyle: {
          backgroundColor: theme.bg.tabBar,
          borderTopColor: theme.border.subtle,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: "Check-in",
          tabBarIcon: ({ color, size }) => <ScanLine color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="salary"
        options={{
          title: "Salary",
          tabBarIcon: ({ color, size }) => <Banknote color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => (
            <View>
              <MessageSquare color={color} size={size ?? 22} />
              <UnreadBadge count={unread} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <User color={color} size={size ?? 22} />,
        }}
      />
    </Tabs>
  )
}
