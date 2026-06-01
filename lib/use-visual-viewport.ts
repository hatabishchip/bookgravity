"use client"

import { useEffect, useState } from "react"

export type ViewportRect = { x: number; y: number; w: number; h: number }

// Track the visual viewport (the area actually visible above the on-screen
// keyboard) so a fixed panel can be pinned to it. This is the reliable fix for
// iOS Safari "jumping": when an input focuses, iOS shrinks the visual viewport
// and auto-scrolls the page, which makes a normal `position:fixed inset-0`
// overlay drift. Pinning the panel to {y,h} keeps it glued to the visible area.
//
// Only listens to `resize` (keyboard show/hide), not `scroll`, to avoid jitter
// during the keyboard animation. Returns null until measured / when inactive.
export function useVisualViewport(active: boolean): ViewportRect | null {
  const [rect, setRect] = useState<ViewportRect | null>(null)

  useEffect(() => {
    if (!active) {
      setRect(null)
      return
    }
    const visual = typeof window !== "undefined" ? window.visualViewport : null
    if (!visual) return
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setRect({ x: visual.offsetLeft, y: visual.offsetTop, w: visual.width, h: visual.height })
      })
    }
    update()
    visual.addEventListener("resize", update)
    visual.addEventListener("scroll", update)
    return () => {
      cancelAnimationFrame(raf)
      visual.removeEventListener("resize", update)
      visual.removeEventListener("scroll", update)
    }
  }, [active])

  return rect
}
