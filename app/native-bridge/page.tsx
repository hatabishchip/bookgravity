"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"

// Landing page the mobile app's admin WebView opens first:
//   /native-bridge?token=<impersonation>&next=/admin
// It exchanges the short-lived token for a web session cookie (same flow as the
// super-admin's /sadmin "open studio admin"), then redirects into the admin so
// the rest of the WebView session is authenticated.
function Bridge() {
  const params = useSearchParams()
  const token = params.get("token")
  const next = params.get("next") || "/admin"
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setError("Missing token."); return }
    let cancelled = false
    ;(async () => {
      try {
        await signIn("credentials", { token, callbackUrl: next })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [token, next])

  return (
    <div className="min-h-[100svh] flex items-center justify-center bg-[#f6f5f3] px-6 text-center">
      {error ? (
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-red-600">Could not open the admin</p>
          <p className="text-xs text-gray-500 mt-1">{error}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Opening admin...</p>
      )}
    </div>
  )
}

export default function NativeBridgePage() {
  return (
    <Suspense fallback={<div className="min-h-[100svh] flex items-center justify-center text-sm text-gray-400">Loading...</div>}>
      <Bridge />
    </Suspense>
  )
}
