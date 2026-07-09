import { useColorScheme } from "react-native"
import { lightTheme, darkTheme, type Theme } from "@/lib/theme"
import { useThemePref } from "@/lib/theme-preference"

// Hook returns the active theme + a `mode` ("light" | "dark") for consumers
// that need to switch images / variants. LIGHT by default regardless of the
// phone's system theme (owner rule 09.07); "Dark" and "System" are opt-in
// from Profile > Appearance (persisted via useThemePref).
export function useTheme(): { theme: Theme; mode: "light" | "dark" } {
  const scheme = useColorScheme()
  const pref = useThemePref((s) => s.pref)
  const mode = pref === "system" ? (scheme === "dark" ? "dark" : "light") : pref
  return {
    theme: mode === "dark" ? darkTheme : lightTheme,
    mode,
  }
}
