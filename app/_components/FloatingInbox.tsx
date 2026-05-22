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

  // Track the visual viewport so the modal height follows the iOS soft
  // keyboard. We deliberately ignore `visualViewport.offsetTop` and pin the
  // modal to top:0 — using offsetTop as `top` was leaking intermediate
  // values during the keyboard show/hide animation and the whole modal
  // jumped down by ~300px after Send. Height-only is jitter-free.
  const [vvHeight, setVvHeight] = useState<number | null>(null)
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) {
      // Browsers without visualViewport (very old) — leave it null and we
      // fall back to 100dvh below.
      return
    }
    let raf = 0
    const update = () => {
      // Defer setState to next frame to coalesce the burst of resize events
      // iOS Safari fires while the keyboard is animating in/out.
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Clamp: never exceed the layout viewport (iOS can briefly report
        // values larger than window.innerHeight during orientation change).
        const h = Math.min(vv.height, window.innerHeight || vv.height)
        setVvHeight(h)
      })
    }
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      cancelAnimationFrame(raf)
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
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
          className="fixed inset-x-0 top-0 z-[60] bg-white overflow-hidden"
          // Height tracks the visual viewport so the keyboard never covers
          // the composer; top stays pinned to 0 to avoid the animation
          // jitter that visualViewport.offsetTop introduces on iOS.
          style={{ height: vvHeight ?? "100dvh" }}
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
