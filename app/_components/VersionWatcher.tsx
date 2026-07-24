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
    // Boot beacon for the self-heal script in the root layout: React mounted,
    // so the bundle is alive - the blank-screen watchdog can stand down. Also
    // tell the native shell right away (its watchdog waits for this handshake).
    ;(window as unknown as { __GS_BOOTED?: boolean }).__GS_BOOTED = true
    try {
      const w = window as unknown as { __GS_NATIVE__?: boolean; ReactNativeWebView?: { postMessage: (d: string) => void } }
      if (w.__GS_NATIVE__ && w.ReactNativeWebView) w.ReactNativeWebView.postMessage(JSON.stringify({ type: "web-alive" }))
    } catch { /* not inside the app */ }
  }, [])

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
        // HARD reload, not location.reload(): a plain reload can be answered
        // from the WebView's bfcache / in-memory page with the SAME stale build
        // (Sveta/Andrey 13.07 - a deploy deleted the running build's route
        // chunks, so the layout+bell rendered but the page content stayed
        // white, and a soft reload restored the same dead page). A distinct,
        // version-stamped URL forces a real network navigation to fresh HTML;
        // clearing CacheStorage first drops any leftover chunk entries. The
        // fresh build carries a NEW build id, so the inline self-heal's
        // per-build attempt counter starts clean and can't stay exhausted.
        const hardReload = () => {
          const u = location.pathname + location.search
          const stamped = u + (u.includes("?") ? "&" : "?") + "gsv=" + v.slice(0, 8)
          location.replace(stamped)
        }
        const jobs: Promise<unknown>[] = []
        try {
          if (typeof window.caches !== "undefined") {
            jobs.push(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))))
          }
        } catch { /* ignore */ }
        Promise.all(jobs).then(hardReload, hardReload)
        setTimeout(hardReload, 2500) // never hang on a stuck cache op
      } catch {
        /* offline / transient — ignore */
      }
    }

    const onVisible = () => { if (document.visibilityState === "visible") check() }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", check)
    // Poll while the app simply stays open. Every trigger below is an event -
    // focus, visibility, bfcache resume - so a user who never leaves the app
    // learned about a deploy only by walking into a deleted route chunk and
    // getting a white page (Sveta, 24.07: two deploys ten minutes apart while
    // she was working). One tiny request a minute closes that window.
    const poll = setInterval(check, 60_000)
    // bfcache restore (Android WebView / iOS resume from a frozen page) fires
    // pageshow with persisted=true and NO normal load event - the exact resume
    // that leaves a stale page on screen. Re-check the version on it too.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) check() }
    window.addEventListener("pageshow", onPageShow)
    // One check on first mount too (covers a tab that was left open across a deploy).
    check()
    return () => {
      clearInterval(poll)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", check)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [])

  return null
}
