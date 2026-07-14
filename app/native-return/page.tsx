"use client"

import { useEffect, useState } from "react"

// Bridge-return page for NATIVE social login (Google).
//
// Why this exists: Google forbids OAuth inside an embedded WebView
// ("disallowed_useragent"), so the app opens the WHOLE Google flow in the
// system browser. But that means the authenticated session cookie lands in the
// system browser, not the app's WebView. This page runs at the END of that
// system-browser flow (it's the signIn callbackUrl): it mints a native token
// pair from the fresh web session and hands it back to the app via the custom
// scheme deep link, which the app's openAuthSessionAsync is waiting on.
export default function NativeReturnPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/auth/web-to-native", { method: "POST", cache: "no-store" })
        if (!res.ok) {
          // 401 = the system-browser session isn't there (login didn't complete).
          setError(res.status === 401 ? "Sign-in didn't complete. Please try again." : "Something went wrong. Please try again.")
          return
        }
        const data = (await res.json()) as { token: string; refreshToken: string; user: unknown }
        if (cancelled) return
        // Hand the token pair back to the app. The app opened this flow with
        // openAuthSessionAsync(returnUrl = "gravitystretching://auth"), so
        // navigating there resolves it with this URL and closes the browser.
        const payload = encodeURIComponent(JSON.stringify({ token: data.token, refreshToken: data.refreshToken, user: data.user }))
        window.location.href = `gravitystretching://auth?d=${payload}`
      } catch {
        if (!cancelled) setError("No connection. Please try again.")
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      {error ? (
        <>
          <p style={{ color: "#b91c1c", fontSize: 15, maxWidth: 320 }}>{error}</p>
          <a href="/login" style={{ color: "#2C6E49", fontWeight: 600, fontSize: 15 }}>Back to sign in</a>
        </>
      ) : (
        <>
          <div style={{ width: 28, height: 28, border: "3px solid #E5E7EB", borderTopColor: "#2C6E49", borderRadius: "50%", animation: "gsspin 0.8s linear infinite" }} />
          <p style={{ color: "#6B7280", fontSize: 15 }}>Returning to the app...</p>
          <style>{"@keyframes gsspin{to{transform:rotate(360deg)}}"}</style>
        </>
      )}
    </div>
  )
}
