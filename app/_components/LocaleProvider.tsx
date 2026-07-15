"use client"

// Admin-panel locale context (owner 15.07). Per-user: each admin flips their
// own language in Settings; trainers/clients never see it.
//
// Boot order: localStorage first (instant paint in the right language, no
// English flash), then one GET /api/admin/locale to sync with the DB (the
// setting follows the account across devices). setLocale updates state +
// localStorage immediately and persists via PATCH in the background.
import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { translate, dateLocaleFor, type AdminLocale } from "@/lib/i18n"

const LS_KEY = "bg.admin.locale"

type Ctx = {
  locale: AdminLocale
  setLocale: (l: AdminLocale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LocaleContext = createContext<Ctx>({
  locale: "en",
  setLocale: () => {},
  t: (key, vars) => translate("en", key, vars),
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AdminLocale>(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(LS_KEY) === "uk") return "uk"
    return "en"
  })

  // Sync with the account's saved setting (covers a fresh browser / device).
  useEffect(() => {
    let alive = true
    fetch("/api/admin/locale", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { locale?: string } | null) => {
        if (!alive || !j) return
        const l: AdminLocale = j.locale === "uk" ? "uk" : "en"
        setLocaleState(l)
        try { window.localStorage.setItem(LS_KEY, l) } catch {}
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const setLocale = useCallback((l: AdminLocale) => {
    setLocaleState(l)
    try { window.localStorage.setItem(LS_KEY, l) } catch {}
    void fetch("/api/admin/locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: l }),
    }).catch(() => {})
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>
}

/** Translator for client components under the admin LocaleProvider. */
export function useT() {
  return useContext(LocaleContext).t
}

export function useLocale() {
  const { locale, setLocale } = useContext(LocaleContext)
  return { locale, setLocale, dateLocale: dateLocaleFor(locale) }
}
