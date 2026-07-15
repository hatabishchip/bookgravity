"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

// ---------------------------------------------------------------------------
// useKeyboardSheet — the SINGLE owner of the WhatsApp-style on-screen keyboard
// state for a chat column (Inbox). Everything the keyboard sheet needs lives
// here:
//
//   • `open`        — React state: is the keyboard shown or hidden.
//   • `--kb-h`      — CSS var: the keyboard panel's natural height (reported
//                     by the Composer via `onPanelHeight`).
//   • `--kb-off`    — CSS var: the live offset (0 = fully open, --kb-h =
//                     fully hidden). `.kb-shell` in globals.css renders
//                     height = var(--kb-h) - var(--kb-off).
//   • drag gesture  — iOS-style interactive dismiss: dragging the thread down
//                     peels the keyboard 1:1 with the finger, release snaps
//                     open/closed by position + velocity.
//
// The CSS vars are written imperatively on `wrapRef` (never through React
// state) so a 60fps finger-drag never triggers a re-render. This hook is the
// only writer of `--kb-off`; the tap/settle path and the drag path both go
// through it, which keeps the two from fighting (previously three separate
// code sites in Inbox wrote the var).
//
// Behaviour is intentionally identical to the pre-refactor inline version —
// the owner's rule: the show/hide mechanics must not change.
// ---------------------------------------------------------------------------

export interface KeyboardSheet {
  /** True while the on-screen keyboard is shown (mobile only; desktop uses
   *  the real keyboard and ignores this). */
  open: boolean
  /** Open/close the keyboard — tap on the input opens, etc. */
  setOpen: (open: boolean) => void
  /** Attach to the wrapper around the composer + keyboard shell. It carries
   *  the --kb-h / --kb-off CSS vars and the .kb-dragging class that the
   *  .kb-shell styles read. */
  wrapRef: RefObject<HTMLDivElement | null>
  /** The Composer reports the keyboard panel's natural pixel height here
   *  (measured with a ResizeObserver — rotation, font scale, panel swap). */
  onPanelHeight: (height: number) => void
}

export default function useKeyboardSheet({
  threadRef,
  resetKey,
}: {
  /** The scrollable message thread — the drag-to-dismiss gesture lives on it. */
  threadRef: RefObject<HTMLDivElement | null>
  /** Changes when a new conversation opens → keyboard resets to hidden
   *  (WhatsApp-style: the newest messages stay visible until the user taps
   *  the input) and the gesture re-binds to the fresh thread element. */
  resetKey?: unknown
}): KeyboardSheet {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // The panel's natural height in px — kept in a ref (not state) because the
  // drag handlers read it every frame.
  const heightRef = useRef(0)

  // Each conversation opens with the keyboard hidden.
  useEffect(() => { setOpen(false) }, [resetKey])

  // Composer reports the keyboard's natural height → store it on the wrapper
  // as --kb-h. If we're not mid-drag, also park --kb-off at its settled target.
  const onPanelHeight = useCallback((h: number) => {
    heightRef.current = h
    const wrap = wrapRef.current
    if (!wrap) return
    // Set --kb-off (target) before --kb-h so the intermediate height never
    // overshoots into a brief open-then-close flash on first measure.
    if (!wrap.classList.contains("kb-dragging")) {
      wrap.style.setProperty("--kb-off", `${open ? 0 : h}px`)
    }
    wrap.style.setProperty("--kb-h", `${h}px`)
  }, [open])

  // Settle/tap animation: whenever the open/closed state changes (and we're
  // not actively dragging), glide --kb-off to its target. The CSS transition
  // on .kb-shell does the easing.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    wrap.classList.remove("kb-dragging")
    wrap.style.setProperty("--kb-off", `${open ? 0 : heightRef.current}px`)
  }, [open, resetKey])

  // Interactive finger-tracking (iOS-style). Dragging the thread down once
  // it's scrolled to the bottom peels the keyboard down 1:1 with the finger;
  // it freezes when the finger stops, follows back up if reversed, and on
  // release snaps open/closed by position + velocity. Native non-passive
  // listeners so we can preventDefault the page scroll while we own the
  // gesture.
  useEffect(() => {
    const el = threadRef.current
    const wrap = wrapRef.current
    if (!el || !wrap) return
    const readOff = () => parseFloat(getComputedStyle(wrap).getPropertyValue("--kb-off")) || 0
    type G = { engaged: boolean; wasOpen: boolean; restingTop: number; lastY: number; lastT: number; vy: number }
    let g: G | null = null

    const onStart = (e: TouchEvent) => {
      const H = heightRef.current
      const off = readOff()
      // restingTop = the keyboard's top edge when fully shown (constant). The
      // shell's current top sits at restingTop + off, so back it out.
      const shell = wrap.querySelector(".kb-shell") as HTMLElement | null
      const restingTop = shell ? shell.getBoundingClientRect().top - off : window.innerHeight - H
      g = {
        engaged: false,
        wasOpen: off < H * 0.5, // dismissing is only offered from an open keyboard
        restingTop,
        lastY: e.touches[0].clientY,
        lastT: e.timeStamp,
        vy: 0,
      }
    }
    const onMove = (e: TouchEvent) => {
      if (!g) return
      const H = heightRef.current
      // A closed keyboard never re-opens from a scroll (tap the field instead),
      // so we leave the thread to scroll normally.
      if (H <= 0 || !g.wasOpen) return
      const y = e.touches[0].clientY
      const dt = e.timeStamp - g.lastT
      if (dt > 0) g.vy = (y - g.lastY) / dt // px/ms, positive = moving down
      g.lastY = y
      g.lastT = e.timeStamp
      // Position-based, like iOS: the keyboard's top edge sticks to the finger
      // whenever the finger is inside the keyboard's vertical zone — independent
      // of scroll position or drag direction. off = how far below the resting
      // top the finger is, clamped to the keyboard height.
      const desired = Math.max(0, Math.min(H, y - g.restingTop))
      if (!g.engaged && desired <= 0) return // finger above the zone → let it scroll
      if (!g.engaged) {
        g.engaged = true
        wrap.classList.add("kb-dragging")
      }
      wrap.style.setProperty("--kb-off", `${desired}px`)
      if (desired <= 0) {
        // Back to fully shown → detach and hand scrolling back to the thread.
        g.engaged = false
        wrap.classList.remove("kb-dragging")
        return
      }
      e.preventDefault() // own the gesture while the keyboard tracks the finger
    }
    const onEnd = () => {
      if (!g) return
      const engaged = g.engaged
      const vy = g.vy
      g = null
      wrap.classList.remove("kb-dragging")
      if (!engaged) return
      const H = heightRef.current
      const off = readOff()
      // Snap by flick velocity first, then by how far it was peeled. Set the
      // target offset directly so it eases even when `open` doesn't change.
      const closing = vy > 0.3 || (vy >= -0.3 && off > H * 0.5)
      wrap.style.setProperty("--kb-off", `${closing ? H : 0}px`)
      setOpen(!closing)
    }
    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  return { open, setOpen, wrapRef, onPanelHeight }
}
