"use client"

import { useEffect } from "react"

// Persists the visitor's chosen studio in a first-party cookie so the apex
// (bookgravity.com) can redirect returning visitors straight to /<slug>.
// Server Components can't set cookies during render, so we do it client-side
// on mount — the value is non-sensitive (just a slug) and best-effort.
export default function StudioCookieSync({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      // 1 year, site-wide, Lax so it rides top-level navigations from Instagram.
      document.cookie = `gs_studio=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`
    } catch {
      /* cookies disabled — apex chooser still works, just no auto-redirect */
    }
  }, [slug])
  return null
}
