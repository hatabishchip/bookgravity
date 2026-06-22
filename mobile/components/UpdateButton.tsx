import { useState, useCallback } from "react"
import { View, Alert } from "react-native"
import * as Updates from "expo-updates"
import { Button } from "@/components/ui/Button"
import { Text } from "@/components/ui/Text"
import { spacing } from "@/lib/theme"

// Over-the-air "Update" button. Lets a tester (or a live user) pull the latest
// JS/asset fix instantly without reinstalling the app. Native changes still
// require a fresh build - those bump the runtimeVersion so a stale binary
// simply won't receive an incompatible update.
//
// Flow on press: check -> (if available) download -> reload into the new code.
// In Expo Go / a dev build, Updates.isEnabled is false, so we explain that
// OTA only works in installed builds (APK / TestFlight / store).

type Status = "idle" | "checking" | "downloading" | "uptodate" | "error"

export function UpdateButton() {
  const [status, setStatus] = useState<Status>("idle")

  const onPress = useCallback(async () => {
    if (!Updates.isEnabled) {
      Alert.alert(
        "Updates",
        "Over-the-air updates work in installed builds (APK or TestFlight), not in Expo Go or development mode.",
      )
      return
    }
    try {
      setStatus("checking")
      const res = await Updates.checkForUpdateAsync()
      if (!res.isAvailable) {
        setStatus("uptodate")
        return
      }
      setStatus("downloading")
      await Updates.fetchUpdateAsync()
      // Apply immediately - this restarts the app into the new version.
      await Updates.reloadAsync()
    } catch (e) {
      console.warn("[ota] update failed:", e)
      setStatus("error")
    }
  }, [])

  const busy = status === "checking" || status === "downloading"
  const label =
    status === "checking" ? "Checking..." :
    status === "downloading" ? "Updating..." :
    "Check for updates"

  const versionLine = [
    Updates.runtimeVersion ? `v${Updates.runtimeVersion}` : null,
    Updates.channel ? Updates.channel : null,
    Updates.updateId ? Updates.updateId.slice(0, 8) : "base",
  ].filter(Boolean).join(" · ")

  return (
    <View style={{ gap: spacing.xs }}>
      <Button title={label} variant="secondary" loading={busy} onPress={onPress} />
      {status === "uptodate" && (
        <Text variant="footnote" tone="muted">You have the latest version.</Text>
      )}
      {status === "error" && (
        <Text variant="footnote" tone="muted">Update check failed. Please try again later.</Text>
      )}
      <Text variant="footnote" tone="muted">{versionLine}</Text>
    </View>
  )
}
