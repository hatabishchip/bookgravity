"use client"

import { useEffect, useState } from "react"
import { WifiOff, RefreshCw } from "lucide-react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

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
          onClick={() => {
            if (offline || !navigator.onLine) {
              window.location.reload()
              return
            }
            reset()
          }}
          className="w-full bg-[#2C6E49] hover:bg-[#1E4D34] text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
