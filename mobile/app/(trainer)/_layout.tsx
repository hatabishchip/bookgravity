import { Stack } from "expo-router"

// Trainer surface = the full web trainer cabinet embedded in a WebView (see
// index.tsx), exactly like the admin surface. No tab bar - the web cabinet
// has its own navigation (owner decision 09.07: the native tabs looked poor
// next to the mobile web version; the ticket scanner is retired).
export default function TrainerLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
