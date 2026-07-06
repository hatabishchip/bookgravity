import { Tabs } from "expo-router"
import { Calendar, Ticket, User } from "lucide-react-native"
import { useTheme } from "@/hooks/useTheme"

export default function ClientTabsLayout() {
  const { theme } = useTheme()
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
          title: "Book",
          tabBarIcon: ({ color, size }) => <Calendar color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Tickets",
          tabBarIcon: ({ color, size }) => <Ticket color={color} size={size ?? 22} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <User color={color} size={size ?? 22} />,
        }}
      />
      {/* Detail screens reached via router.push (index→slots→book, bookings→
          ticket). Expo Router auto-makes a tab per file, so hide these from
          the tab bar with href:null - the routes stay pushable, the bar shows
          only Book · Tickets · Profile. */}
      <Tabs.Screen name="slots" options={{ href: null }} />
      <Tabs.Screen name="book" options={{ href: null }} />
      <Tabs.Screen name="ticket" options={{ href: null }} />
    </Tabs>
  )
}
