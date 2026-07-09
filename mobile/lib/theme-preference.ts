import { create } from "zustand"
import * as SecureStore from "expo-secure-store"

// Appearance preference (owner rule 09.07): the app is LIGHT by default for
// everyone - a dark phone must not silently flip the whole app dark. Users
// can opt into Dark or back into following the system from Profile.
export type ThemePref = "light" | "dark" | "system"

const KEY = "gs_theme_pref"

type ThemePrefState = {
  pref: ThemePref
  setPref: (p: ThemePref) => void
  hydratePref: () => Promise<void>
}

export const useThemePref = create<ThemePrefState>((set) => ({
  pref: "light",
  setPref: (p) => {
    set({ pref: p })
    SecureStore.setItemAsync(KEY, p).catch(() => {})
  },
  hydratePref: async () => {
    try {
      const v = await SecureStore.getItemAsync(KEY)
      if (v === "light" || v === "dark" || v === "system") set({ pref: v })
    } catch {
      /* first launch / storage unavailable - stay on the light default */
    }
  },
}))
