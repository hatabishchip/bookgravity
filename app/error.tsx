"use client"

import { useEffect, useRef, useState } from "react"
import { WifiOff, RefreshCw, Loader2 } from "lucide-react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState(false)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
    }
  }, [])

  // A stale chunk/module error (a newer deploy removed the chunk this bundle
  // asks for) self-heals with a cache-busting hard reload - no tap needed,
  // guarded to 2 attempts per build so a real bug can't loop (Sveta 10.07).
  useEffect(() => {
    const m = error?.message ?? ""
    if (!/ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(m)) return
    const BUILT = process.env.NEXT_PUBLIC_BUILD_ID || "dev"
    const KEY = "gs-heal-" + BUILT
    let n = 0
    try { n = parseInt(localStorage.getItem(KEY) || "0", 10) } catch { /* ignore */ }
    if (n >= 2) return
    try { localStorage.setItem(KEY, String(n + 1)) } catch { /* ignore */ }
    try {
      const p = JSON.stringify({ message: "segment chunk self-heal", kind: "recovery", platform: "web", appVersion: BUILT, stack: location.pathname })
      if (navigator.sendBeacon) navigator.sendBeacon("/api/native/log-crash", new Blob([p], { type: "application/json" }))
    } catch { /* ignore */ }
    setBusy(true)
    reloadTimer.current = setTimeout(() => {
      const u = location.pathname + location.search
      location.replace(u + (u.includes("?") ? "&" : "?") + "gsheal=" + (n + 1))
    }, 400)
  }, [error])

  // The tap MUST visibly do something. Show a spinner immediately, then try
  // Next's in-place reset() for a fast recovery; if the segment still can't
  // render (so this component stays mounted), a hard reload kicks in after a
  // beat. When reset() succeeds the component unmounts and the cleanup above
  // clears the pending reload, so there's no redundant double-load.
  const handleRetry = () => {
    if (busy) return
    setBusy(true)
    if (offline || !navigator.onLine) {
      window.location.reload()
      return
    }
    try { reset() } catch { /* fall through to hard reload */ }
    reloadTimer.current = setTimeout(() => window.location.reload(), 600)
  }

  // Treat fetch/network failures as offline-ish errors
  const looksOffline = offline ||
    /Failed to fetch|NetworkError|Load failed|ERR_INTERNET_DISCONNECTED/i.test(error?.message ?? "")

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mx-auto mb-5">
          {looksOffline ? (
            <WifiOff size={28} className="text-brand" />
          ) : (
            <RefreshCw size={28} className="text-brand" />
          )}
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {looksOffline ? "No internet connection" : "Something went wrong"}
        </h1>

        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          {looksOffline
            ? "Check your Wi-Fi or mobile data and try again."
            : "Please reload the page. If the problem persists, try again in a moment."}
        </p>

        <button
          onClick={handleRetry}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark active:bg-[#16391f] disabled:opacity-90 text-white font-semibold py-3 rounded-xl transition-colors min-h-[48px]"
        >
          {busy ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Reloading…
            </>
          ) : (
            "Try again"
          )}
        </button>
      </div>
    </div>
  )
}
