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

  // Lock body scroll while the modal is open. We deliberately DON'T use the
  // `position: fixed; top: -scrollY` pattern here — that turns the body into
  // a positioned ancestor and on iOS Safari it ends up reparenting our
  // `position: fixed inset-0` modal's coordinate space, making the modal
  // slide up by the page's scroll offset when the keyboard opens. Plain
  // overflow:hidden on html+body is enough and keeps the modal anchored
  // to the actual viewport.
  useEffect(() => {
    if (!open) return
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [open])

  // Track the visual viewport rect so we can park the chat region exactly
  // over the visible area, even when iOS Safari scrolls itself in response
  // to a textarea focus. The outer modal layer is a full-screen white
  // backdrop so nothing peeks through, and this inner rect floats over it
  // following the keyboard/URL-bar geometry.
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
    // Also listen to plain window scroll because iOS sometimes scrolls the
    // window (not just the visual viewport) when bringing inputs into view.
    window.addEventListener("scroll", update, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      visual.removeEventListener("resize", update)
      visual.removeEventListener("scroll", update)
      window.removeEventListener("scroll", update)
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
        // Two-layer modal:
        //   • outer = full-viewport white backdrop, never moves (covers the
        //     page underneath at all times, including when iOS scrolls the
        //     window for a focused input)
        //   • inner = chat region parked over the *visual* viewport so the
        //     composer always sits above the keyboard and the chat header
        //     stays glued to the top of the visible area
        <div
          className="fixed inset-0 z-[60] bg-white overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="WhatsApp Inbox"
        >
          <div
            className="absolute bg-white overflow-hidden"
            style={
              vv
                ? { top: vv.y, left: vv.x, width: vv.w, height: vv.h }
                : { inset: 0 }
            }
          >
            <Inbox role={role} embedded onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
