import { Stack } from "expo-router"

// The app IS the mobile web 1:1 (owner-approved 09.07): one WebView screen
// for everyone - guests see the public schedule, signed-in staff their
// cabinet. The only native screen on top is Notifications (OS permission).
export default function WebLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
