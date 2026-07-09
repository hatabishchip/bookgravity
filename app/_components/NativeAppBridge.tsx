"use client"

import { useEffect } from "react"
import { Bell } from "lucide-react"

// Glue for pages rendered INSIDE the native app's WebView (the app is the
// mobile web 1:1 since 09.07). The native shell injects window.__GS_NATIVE__
// before content loads; ReactNativeWebView.postMessage is the channel back.

type NativeWindow = Window & {
  __GS_NATIVE__?: boolean
  ReactNativeWebView?: { postMessage: (data: string) => void }
}

function nativeChannel(): ((data: string) => void) | null {
  if (typeof window === "undefined") return null
  const w = window as NativeWindow
  if (!w.__GS_NATIVE__ || !w.ReactNativeWebView) return null
  return (data) => w.ReactNativeWebView!.postMessage(data)
}

// Invisible: after a web sign-in inside the app, hand the native shell its
// own token pair so push notifications work. The layout mounts once per full
// page load (client-side navigations don't remount it), so this fires once
// per login redirect - and re-sending is harmless anyway (the shell just
// re-saves the same session). Deliberately NO sessionStorage guard: it would
// survive a sign-out inside the same WebView and silently kill push on the
// next sign-in.
export function NativeAuthBridge() {
  useEffect(() => {
    const post = nativeChannel()
    if (!post) return
    ;(async () => {
      try {
        const res = await fetch("/api/auth/web-to-native", { method: "POST" })
        if (!res.ok) return
        const data = await res.json()
        if (!data?.token) return
        post(JSON.stringify({ type: "native-auth", ...data }))
      } catch {
        /* offline or logged out - the next page load retries */
      }
    })()
  }, [])
  return null
}

// A menu row that exists ONLY inside the native app: opens the native
// "Notifications" screen (OS permission, push status, alert mode).
export function NativeNotificationSettingsLink() {
  const post = nativeChannel()
  if (!post) return null
  return (
    <button
      onClick={() => post(JSON.stringify({ type: "open-notifications" }))}
      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5 w-full transition-colors"
    >
      <Bell size={18} />
      Notification settings
    </button>
  )
}
