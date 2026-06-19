"use client"

import { useEffect, useRef } from "react"

// Auto-update to the latest deploy without any manual cache clearing.
//
// The commit sha baked into THIS bundle (NEXT_PUBLIC_BUILD_ID, frozen at build)
// is compared against the server's current build id (/api/version). When they
// differ, the running app is stale (a newer deploy is live) and we reload once
// to pick it up. We check the moment the app regains focus / becomes visible,
// which is exactly when a home-screen (standalone) iOS app resumes the old
// in-memory bundle — the case that used to need a full close + reopen.
const BUILT = process.env.NEXT_PUBLIC_BUILD_ID || "dev"

export default function VersionWatcher() {
  const reloading = useRef(false)

  useEffect(() => {
    // No commit sha locally → nothing to compare, and we never want a dev reload.
    if (BUILT === "dev") return

    const check = async () => {
      if (reloading.current || document.visibilityState !== "visible") return
      try {
        const r = await fetch("/api/version", { cache: "no-store" })
        if (!r.ok) return
        const { v } = (await r.json()) as { v?: string }
        if (!v || v === BUILT) return
        // Reload once per target version per session, so a misconfigured build
        // id can never turn into a reload loop.
        const key = "vw-reloaded-" + v
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, "1")
        reloading.current = true
        location.reload()
      } catch {
        /* offline / transient — ignore */
      }
    }

    const onVisible = () => { if (document.visibilityState === "visible") check() }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", check)
    // One check on first mount too (covers a tab that was left open across a deploy).
    check()
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", check)
    }
  }, [])

  return null
}
