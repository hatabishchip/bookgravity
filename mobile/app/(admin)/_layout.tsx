import { Stack } from "expo-router"

// Admin surface = the full web admin embedded in a WebView (see index.tsx).
// No tab bar - the web admin has its own navigation.
export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
