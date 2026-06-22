"use client"

import { useCallback, useEffect, useState } from "react"
import { Bell } from "lucide-react"

// Registers the push service worker and subscribes this browser for Web Push so
// the cabinet rings like WhatsApp on new client messages. Renders a small
// "Enable notifications" button until permission is granted; after that it stays
// silent and just keeps the subscription fresh. Mounted in the admin/trainer
// shells (signed-in users only).

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

// iOS only allows web push when the site is installed to the home screen
// (display-mode: standalone). Detect Safari-on-iOS-not-installed to hint.
function iosNeedsInstall(): boolean {
  if (typeof window === "undefined") return false
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  return isIOS && !standalone
}

export default function WebPushManager() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default")
  const [needInstall, setNeedInstall] = useState(false)
  const [busy, setBusy] = useState(false)

  const subscribe = useCallback(async () => {
    if (!pushSupported() || !VAPID_PUBLIC) return
    const reg = await navigator.serviceWorker.register("/sw.js")
    await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: the runtime value is a valid Uint8Array; the double-cast just
        // sidesteps the strict ArrayBufferLike/SharedArrayBuffer variance in
        // newer TS lib.dom types.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as unknown as BufferSource,
      })
    }
    await fetch("/api/web-push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    })
  }, [])

  useEffect(() => {
    if (!pushSupported()) { setPerm("unsupported"); return }
    setNeedInstall(iosNeedsInstall())
    const p = Notification.permission
    setPerm(p)
    // Already granted -> make sure this browser is subscribed (idempotent).
    if (p === "granted") subscribe().catch(() => {})
  }, [subscribe])

  const enable = useCallback(async () => {
    setBusy(true)
    try {
      const p = await Notification.requestPermission()
      setPerm(p)
      if (p === "granted") await subscribe()
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }, [subscribe])

  if (perm === "unsupported" || perm === "granted" || perm === "denied") {
    // iOS Safari not installed: a one-line hint so the user knows how to enable.
    if (perm !== "granted" && needInstall) {
      return (
        <div className="fixed bottom-24 right-4 z-30 max-w-[230px] rounded-xl bg-white shadow-lg border border-gray-100 px-3 py-2 text-[11px] text-gray-500">
          To get client-message alerts on iPhone: Share - Add to Home Screen, then open from there.
        </div>
      )
    }
    return null
  }

  return (
    <button
      onClick={enable}
      disabled={busy}
      className="fixed bottom-24 right-4 z-30 flex items-center gap-2 rounded-full bg-brand text-white text-xs font-semibold px-4 py-2.5 shadow-lg hover:bg-brand-dark disabled:opacity-60"
    >
      <Bell size={15} />
      {busy ? "Enabling..." : "Enable message alerts"}
    </button>
  )
}
