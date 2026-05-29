import { useColorScheme } from "react-native"
import { lightTheme, darkTheme, type Theme } from "@/lib/theme"

// Hook returns the active theme + a `mode` ("light" | "dark") for consumers
// that need to switch images / variants. Follows the iOS system setting
// automatically — no in-app toggle needed for the MVP.
export function useTheme(): { theme: Theme; mode: "light" | "dark" } {
  const scheme = useColorScheme()
  const mode = scheme === "dark" ? "dark" : "light"
  return {
    theme: mode === "dark" ? darkTheme : lightTheme,
    mode,
  }
}
