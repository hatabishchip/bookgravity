"use client"

import { useEffect, useState } from "react"

// Top-level React boundary: renders when ANYTHING in the tree throws during
// render (the class of blank screen the inline chunk-heal script can't catch,
// because React already booted). Instead of sitting on a manual button
// (Sveta's white screen, 10.07), it self-heals: clear CacheStorage + service
// workers and hard-reload with a cache-busting query - the "clear cache" fix,
// automatic. Guarded to 2 attempts per build so a genuinely broken deploy
// can't loop; after that the manual retry stays as a fallback.
// Must include <html> and <body>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [healing, setHealing] = useState(true)

  useEffect(() => {
    const BUILT = process.env.NEXT_PUBLIC_BUILD_ID || "dev"
    const KEY = "gs-heal-" + BUILT
    let attempts = 0
    try { attempts = parseInt(localStorage.getItem(KEY) || "0", 10) } catch { /* private mode */ }

    // Report the recovery (best-effort) so we see how often this fires.
    try {
      const payload = JSON.stringify({ message: "global-error self-heal", kind: "recovery", platform: "web", appVersion: BUILT, stack: location.pathname })
      if (navigator.sendBeacon) navigator.sendBeacon("/api/native/log-crash", new Blob([payload], { type: "application/json" }))
    } catch { /* ignore */ }

    if (attempts >= 2) { setHealing(false); return }
    try { localStorage.setItem(KEY, String(attempts + 1)) } catch { /* ignore */ }

    const bust = () => {
      const u = location.pathname + location.search
      location.replace(u + (u.includes("?") ? "&" : "?") + "gsheal=" + (attempts + 1))
    }
    const jobs: Promise<unknown>[] = []
    try {
      if (typeof window.caches !== "undefined") jobs.push(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))))
      if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))))
    } catch { /* ignore */ }
    Promise.all(jobs).then(bust, bust)
    const t = setTimeout(bust, 3000)
    return () => clearTimeout(t)
  }, [])

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#F5F4F0", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ maxWidth: 384, width: "100%", background: "white", borderRadius: 16, padding: 32, textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(44,110,73,0.1)", margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2C6E49" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8, margin: "0 0 8px" }}>
              {healing ? "Updating the app..." : "Something went wrong"}
            </h1>
            <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.5, margin: "0 0 24px" }}>
              {healing ? "One moment, refreshing to the latest version." : "Please check your internet and try again."}
            </p>
            <button
              onClick={() => { try { reset() } catch { /* ignore */ } window.location.reload() }}
              style={{ width: "100%", background: "#2C6E49", color: "white", fontWeight: 600, padding: "12px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 14, minHeight: 48 }}
            >
              {healing ? "Refresh now" : "Try again"}
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
