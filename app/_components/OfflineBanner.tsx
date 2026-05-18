"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"

export default function OfflineBanner() {
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

  if (!offline) return null

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-white text-sm px-4 py-2 flex items-center justify-center gap-2 shadow-md">
      <WifiOff size={16} />
      <span className="font-medium">No internet connection</span>
    </div>
  )
}
