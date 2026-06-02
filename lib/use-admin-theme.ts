"use client"

import { useEffect, useState } from "react"

// Admin-only light/dark theme, persisted in localStorage. The admin shell adds
// the `.dark` class to its root based on this, which drives both the explicit
// `dark:` variants and the `.dark main` remap in globals.css. Scoped to admin
// so the public booking site stays light.

export type AdminTheme = "light" | "dark"
const KEY = "admin-theme"
const EVENT = "admin-theme-change"

function read(): AdminTheme {
  if (typeof window === "undefined") return "light"
  return window.localStorage.getItem(KEY) === "dark" ? "dark" : "light"
}

export function useAdminTheme() {
  const [theme, setThemeState] = useState<AdminTheme>("light")

  useEffect(() => {
    setThemeState(read())
    const sync = () => setThemeState(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const setTheme = (t: AdminTheme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, t)
      window.dispatchEvent(new Event(EVENT))
    }
    setThemeState(t)
  }

  return { theme, setTheme }
}
