"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"

// SUPER_ADMIN one-click "open this studio's admin". Opened in a new tab from
// /sadmin. Fetches a short-lived impersonation token, then signs in AS the
// studio's admin and lands on /admin. (Auth cookies are per-browser, so this
// replaces the super-admin session in this browser — sign back in as
// super-admin afterwards.)
function Impersonating() {
  const params = useSearchParams()
  const studioId = params.get("studio")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studioId) { setError("Missing studio."); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/sadmin/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studioId }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || !j.token) {
          if (!cancelled) setError(j.error ?? `HTTP ${res.status}`)
          return
        }
        await signIn("credentials", { token: j.token, callbackUrl: "/admin" })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [studioId])

  return (
    <div className="min-h-[100svh] flex items-center justify-center bg-sand px-6 text-center">
      {error ? (
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-red-600">Couldn&apos;t open the studio admin</p>
          <p className="text-xs text-gray-500 mt-1">{error}</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <span className="w-4 h-4 border-2 border-gray-300 border-t-brand rounded-full animate-spin" />
          Opening the studio admin…
        </div>
      )}
    </div>
  )
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={null}>
      <Impersonating />
    </Suspense>
  )
}
