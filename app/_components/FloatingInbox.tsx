"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { MessageSquare } from "lucide-react"
import Inbox from "@/app/_components/Inbox"
import { cn } from "@/lib/utils"
import { useAdminTheme } from "@/lib/use-admin-theme"

/**
 * Floating chat button anchored to the bottom-right of every page in the
 * admin/trainer area. Shows a badge with the number of CONVERSATIONS that
 * have unread inbound messages (not the total message count). Click opens
 * a fullscreen modal containing the Inbox.
 *
 * The modal is rendered via a React portal directly under document.body so
 * no ancestor's positioning context (flex layouts, transforms in parent
 * components, etc.) can affect it. The body is fully locked while it's
 * open: position:fixed at top:0 + overflow:hidden so iOS Safari can't
 * scroll the document underneath us when the user focuses the textarea.
 */
export default function FloatingInbox({ role }: { role: "ADMIN" | "TRAINER" }) {
  const pathname = usePathname()
  // The modal is portaled to <body>, OUTSIDE the admin shell's `.dark`
  // wrapper — so the dark theme (both the `dark:` variants and the
  // `.dark main` remap) is lost and the chat renders light. Re-apply the
  // theme on the portal root so it matches the rest of the admin.
  const { theme } = useAdminTheme()
  const [open, setOpen] = useState(false)
  // When opened via the "Open chat" buttons elsewhere (Bookings / Schedule /
  // Schedule Beta / Trainers), this holds the conversation to jump straight to.
  const [initialChatId, setInitialChatId] = useState<string | null>(null)
  // Desktop = wide viewport + real pointer. The visualViewport-tracking hack
  // below is ONLY needed on mobile (to dodge the iOS keyboard); on desktop it
  // can mis-size/offset the modal when browser zoom ≠ 100% (the visual and
  // layout viewports diverge), which made the chat "float"/overlap.
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (pointer: fine)")
    const update = () => setDesktop(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  const [unreadChats, setUnreadChats] = useState(0)
  const [mounted, setMounted] = useState(false)
  // Per-studio gate. We default to `null` while loading so the FAB doesn't
  // flash for studios that don't have WhatsApp enabled.
  const [waEnabled, setWaEnabled] = useState<boolean | null>(null)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/studio", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setWaEnabled(Boolean(d?.whatsappEnabled))
      })
      .catch(() => {
        if (!cancelled) setWaEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Poll the conversations list so the badge stays roughly fresh.
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
    // CPU guard (Vercel Fluid limit, 2026-06-12): this used to poll every 20s
    // on EVERY admin page with the modal closed, tab visible or not — the
    // single biggest function burner. Closed modal only needs the unread
    // badge: 90s is plenty. Hidden tabs don't poll at all.
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      refresh()
    }
    const t = setInterval(tick, open ? 20_000 : 90_000)
    const onVis = () => { if (document.visibilityState === "visible") refresh() }
    document.addEventListener("visibilitychange", onVis)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis) }
  }, [refresh, open])

  // When the modal closes, refresh once so the badge updates if the user
  // just read some chats.
  useEffect(() => {
    if (!open) refresh()
  }, [open, refresh])

  // Hide the FAB on the dedicated inbox pages.
  const hidden =
    pathname === "/admin/inbox" ||
    pathname === "/trainer/inbox" ||
    pathname.startsWith("/admin/inbox/") ||
    pathname.startsWith("/trainer/inbox/")

  // Body lock. We use `position: fixed; top: 0` instead of `top: -scrollY`
  // because the latter — although it preserves the page's scroll position
  // visually — turns the body into a positioned ancestor and on iOS Safari
  // ends up reparenting our `position: fixed inset-0` modal's coordinate
  // space, which made the whole modal "slide up by the page's scrollY"
  // when the keyboard opened. By holding body at top:0 we keep the
  // modal's anchor honest; we save and restore the scroll position
  // ourselves on close.
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    const body = document.body
    const html = document.documentElement
    const prev = {
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
    }
    body.style.position = "fixed"
    body.style.top = "0"
    body.style.left = "0"
    body.style.right = "0"
    body.style.width = "100%"
    body.style.overflow = "hidden"
    html.style.overflow = "hidden"
    return () => {
      body.style.position = prev.bodyPosition
      body.style.top = prev.bodyTop
      body.style.left = prev.bodyLeft
      body.style.right = prev.bodyRight
      body.style.width = prev.bodyWidth
      body.style.overflow = prev.bodyOverflow
      html.style.overflow = prev.htmlOverflow
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // Track the visual viewport so the inner chat region parks over the
  // visible area even when iOS auto-scrolls the page on focus. We listen
  // only to `resize` (keyboard show/hide) and ignore `scroll` to avoid the
  // jitter we saw earlier when iOS fires intermediate scroll events during
  // the keyboard animation.
  const [vv, setVv] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  )
  useEffect(() => {
    // Desktop: never track visualViewport — keep the modal pinned to inset:0.
    if (!open || desktop) { setVv(null); return }
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
    return () => {
      cancelAnimationFrame(raf)
      visual.removeEventListener("resize", update)
    }
  }, [open, desktop])

  // ESC closes the modal.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // "Open chat" buttons across the admin dispatch this event with a resolved
  // conversation id — open the same modal, straight onto that conversation,
  // so closing it returns the user to the page they came from.
  useEffect(() => {
    const onOpenChat = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id
      if (!id) return
      setInitialChatId(id)
      setOpen(true)
    }
    window.addEventListener("bg:open-chat", onOpenChat as EventListener)
    return () => window.removeEventListener("bg:open-chat", onOpenChat as EventListener)
  }, [])

  // Block iOS Safari's two-finger pinch-to-zoom while the modal is open.
  // The viewport meta + CSS touch-action take care of most cases, but iOS
  // still fires non-standard `gesturestart` events for pinch — calling
  // preventDefault on those keeps the modal at 1× zoom.
  useEffect(() => {
    if (!open) return
    const prevent = (e: Event) => e.preventDefault()
    document.addEventListener("gesturestart", prevent, { passive: false })
    document.addEventListener("gesturechange", prevent, { passive: false })
    document.addEventListener("gestureend", prevent, { passive: false })
    return () => {
      document.removeEventListener("gesturestart", prevent)
      document.removeEventListener("gesturechange", prevent)
      document.removeEventListener("gestureend", prevent)
    }
  }, [open])

  if (hidden) return null
  // Per-studio WhatsApp gate: hide entirely until the super-admin enables
  // it. While we're still fetching the flag, render nothing — prevents the
  // FAB from briefly flashing in studios that don't have it.
  if (waEnabled !== true) return null

  const modal = open ? (
    // `.dark` re-applies the dark theme inside the portal; the nested
    // <main> (display:contents, so it adds no box) re-establishes the
    // `.dark main` remap scope used across the admin. Both are needed
    // because the portal lives under <body>, outside the admin shell.
    <div className={theme === "dark" ? "dark" : undefined}>
      <main className="contents">
        <div
          // `touch-action: pan-y` blocks pinch-to-zoom on iOS Safari while still
          // allowing vertical scroll of the chat thread (we don't need horizontal
          // pan anywhere inside the modal). Without this iOS lets two-finger
          // gestures zoom the page even though the viewport meta has
          // user-scalable=no.
          className="fixed inset-0 z-[2147483646] bg-white dark:bg-[#0B141A] overflow-hidden touch-pan-y"
          // The outer layer NEVER moves and is fully opaque — this is what
          // guarantees the underlying admin page can't peek through.
          role="dialog"
          aria-modal="true"
          aria-label="WhatsApp Inbox"
        >
          <div
            className="absolute bg-white dark:bg-[#0B141A] overflow-hidden"
            style={
              vv
                ? { top: vv.y, left: vv.x, width: vv.w, height: vv.h }
                : { inset: 0 }
            }
          >
            <Inbox role={role} embedded initialSelectedId={initialChatId} onClose={() => { setOpen(false); setInitialChatId(null) }} />
          </div>
        </div>
      </main>
    </div>
  ) : null

  return (
    <>
      <button
        onClick={() => { setInitialChatId(null); setOpen(true) }}
        className={cn(
          "fixed right-5 lg:right-6 z-40",
          "w-14 h-14 rounded-full bg-brand hover:bg-brand-dark text-white shadow-lg",
          "flex items-center justify-center transition-transform active:scale-95",
          "ring-4 ring-white/80",
        )}
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
            )}
          >
            {unreadChats > 99 ? "99+" : unreadChats}
          </span>
        )}
      </button>

      {mounted && modal && createPortal(modal, document.body)}
    </>
  )
}
