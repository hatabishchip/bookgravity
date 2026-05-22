"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { MessageSquare } from "lucide-react"
import Inbox from "@/app/_components/Inbox"
import { cn } from "@/lib/utils"

/**
 * Floating chat button anchored to the bottom-right of every page in the
 * admin/trainer area. Shows a badge with the number of CONVERSATIONS that
 * have unread inbound messages (not the total message count). Click opens a
 * fullscreen modal containing the Inbox.
 *
 * Hidden on the dedicated /admin/inbox and /trainer/inbox pages to avoid
 * UI duplication.
 */
export default function FloatingInbox({ role }: { role: "ADMIN" | "TRAINER" }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [unreadChats, setUnreadChats] = useState(0)

  // Poll the conversations list so the badge stays roughly fresh without
  // pushing for a websocket layer just for this. Server-side `unread` is
  // already per-role-aware so we just count rows where it's > 0.
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/conversations", { cache: "no-store" })
      if (!r.ok) return
      const list: { unread: number }[] = await r.json()
      setUnreadChats(list.filter((c) => (c.unread ?? 0) > 0).length)
    } catch {
      // ignore network blips
    }
  }, [])

  useEffect(() => {
    refresh()
    // Less aggressive than the inbox itself (which polls every 8-15s while open).
    const t = setInterval(refresh, 20_000)
    return () => clearInterval(t)
  }, [refresh])

  // When the modal closes, refresh once so the badge updates if the user
  // just read some chats.
  useEffect(() => {
    if (!open) refresh()
  }, [open, refresh])

  // Hide the FAB on the dedicated inbox pages — the inline page already
  // serves the same purpose, and stacking a button over it is noisy.
  const hidden =
    pathname === "/admin/inbox" ||
    pathname === "/trainer/inbox" ||
    pathname.startsWith("/admin/inbox/") ||
    pathname.startsWith("/trainer/inbox/")

  // Lock the body while the modal is open. `overflow: hidden` alone isn't
  // enough on iOS Safari — focusing the textarea inside a `position: fixed`
  // child still lets Safari scroll the underlying document. The reliable
  // pattern is to freeze the body at its current scroll position with
  // `position: fixed` and restore it on close.
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    }
    document.body.style.position = "fixed"
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = "0"
    document.body.style.right = "0"
    document.body.style.width = "100%"
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.position = prev.position
      document.body.style.top = prev.top
      document.body.style.left = prev.left
      document.body.style.right = prev.right
      document.body.style.width = prev.width
      document.body.style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // Track the visual viewport (width/height/offset). On iOS Safari, when the
  // soft keyboard opens, the visual viewport shrinks *and moves down* within
  // the layout viewport. If we leave the modal at position:fixed top:0, the
  // modal stays glued to the layout's top and visually slides off the screen,
  // exposing the page underneath (the bug shown in the user's screen recording).
  //
  // Instead we anchor the modal at top:0/left:0 and translate it by the visual
  // viewport's offset, with width/height matching the visible area. That way
  // the modal always covers exactly what the user can see and the textarea
  // sits flush above the keyboard.
  const [vv, setVv] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  )
  useEffect(() => {
    if (!open) return
    const visual = window.visualViewport
    if (!visual) return
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      // Coalesce the burst of resize/scroll events iOS fires while animating
      // the keyboard — one apply per frame instead of 10.
      raf = requestAnimationFrame(() => {
        setVv({
          x: visual.offsetLeft,
          y: visual.offsetTop,
          w: visual.width,
          h: visual.height,
        })
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
  }, [open])

  // ESC closes the modal.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (hidden) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed right-5 lg:right-6 z-40",
          "w-14 h-14 rounded-full bg-[#2C6E49] hover:bg-[#1E4D34] text-white shadow-lg",
          "flex items-center justify-center transition-transform active:scale-95",
          "ring-4 ring-white/80",
        )}
        // Sit 20px above the iOS home indicator / address bar safe area, so
        // the button is never hidden by Safari chrome on iPhone.
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
        aria-label={
          unreadChats > 0
            ? `Open inbox (${unreadChats} unread chat${unreadChats === 1 ? "" : "s"})`
            : "Open inbox"
        }
        title="Inbox"
      >
        <MessageSquare size={24} strokeWidth={2.2} />
        {unreadChats > 0 && (
          <span
            className={cn(
              "absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5",
              "rounded-full bg-red-500 text-white text-[11px] font-bold",
              "flex items-center justify-center border-2 border-white shadow",
              "animate-in fade-in zoom-in-95",
            )}
          >
            {unreadChats > 99 ? "99+" : unreadChats}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed top-0 left-0 z-[60] bg-white overflow-hidden"
          style={
            vv
              ? {
                  width: vv.w,
                  height: vv.h,
                  // translate3d is GPU-composited — applied without a layout
                  // pass, which keeps the modal smooth while the keyboard
                  // animates in and out.
                  transform: `translate3d(${vv.x}px, ${vv.y}px, 0)`,
                }
              : {
                  // Pre-measurement fallback (also covers browsers without
                  // visualViewport).
                  width: "100vw",
                  height: "100dvh",
                }
          }
          role="dialog"
          aria-modal="true"
          aria-label="WhatsApp Inbox"
        >
          <Inbox role={role} embedded onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}
