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
    <div className="min-h-screen bg-[#F5F4F0] flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-[#2C6E49]/10 flex items-center justify-center mx-auto mb-5">
          {looksOffline ? (
            <WifiOff size={28} className="text-[#2C6E49]" />
          ) : (
            <RefreshCw size={28} className="text-[#2C6E49]" />
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
          className="w-full flex items-center justify-center gap-2 bg-[#2C6E49] hover:bg-[#1E4D34] active:bg-[#16391f] disabled:opacity-90 text-white font-semibold py-3 rounded-xl transition-colors min-h-[48px]"
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
