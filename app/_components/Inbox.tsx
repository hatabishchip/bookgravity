"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { upload } from "@vercel/blob/client"
import Composer from "@/app/_components/Composer"
import useKeyboardSheet from "@/app/_components/useKeyboardSheet"
import { readListCache, writeListCache, readDetailCache, writeDetailCache } from "@/lib/inbox-cache"
import ChatBookingSheet, { type ChatBooking } from "@/app/_components/ChatBookingSheet"
import ImageLightbox from "@/app/_components/ImageLightbox"
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns"
import {
  ArrowLeft,
  AArrowDown,
  AArrowUp,
  Check,
  CheckCheck,
  ChevronDown,
  Image as ImageIcon,
  Calendar,
  Loader2,
  MessageSquare,
  Search,
  Send,
  Sparkles,
  UserCircle2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Trainer = { id: string; name: string; color?: string }

type ConversationListItem = {
  id: string
  clientPhone: string
  clientName: string | null
  assignedTrainer: Trainer | null
  /** Every trainer that has access to this chat (multi-assign). Includes the
   *  assignedTrainer. Order = insertion (older bookings first). */
  accessTrainers: Trainer[]
  lastMessageAt: string
  lastInboundAt: string | null
  unread: number
  /** The client's latest class by class date — their next/upcoming booking,
   *  or (if none) the last class they had. Null if they never booked. */
  lastClass: { date: string; startTime: string; endTime: string } | null
  /** Does this client have a CONFIRMED booking today / tomorrow (studio-local)?
   *  Drives the Today / Tomorrow chat-list filter. */
  bookedToday?: boolean
  bookedTomorrow?: boolean
  /** The client's latest message has no staff reply/reaction yet — powers the
   *  admin's "Awaiting reply" filter tab. */
  awaitingReply?: boolean
  bookingPreview: string | null
  lastMessage: {
    id: string
    direction: "INBOUND" | "OUTBOUND"
    type: string
    body: string | null
    createdAt: string
    /** The last word in this chat is the agent's - sidebar 🤖 badge. */
    fromAgent?: boolean
  } | null
}

type MessageRow = {
  id: string
  direction: "INBOUND" | "OUTBOUND"
  type: string
  body: string | null
  /** Auto-translation produced by the server. For inbound: client's text
   *  translated into the studio's inboxLanguage. For outbound: admin's
   *  text translated into the client's language (what was actually sent).
   *  Null when no translation happened (already same language, off, etc). */
  translatedBody: string | null
  /** ISO 639-1 of body. Used to label the "Original (EN): …" subtitle. */
  detectedLang: string | null
  /** Provider tag (gem/gro/cla/dpl/goo) shown as a tiny label on the
   *  translation footer so we can see which engine did the translation. */
  translatedVia?: string | null
  mediaUrl: string | null
  mediaMime: string | null
  templateName: string | null
  status: string
  errorDetail: string | null
  /** CLIENT-ONLY (never from the server): the local object URL for an
   *  outbound photo/video we're sending. Kept even after the server row
   *  arrives so the bubble shows the same pixels while the proxy image
   *  preloads - no flicker. Revoked once the proxy has taken over. */
  localMediaUrl?: string | null
  /** CLIENT-ONLY: upload progress for an outbound media bubble.
   *  phase "uploading" = phone->server (real %); "processing" = server->Meta
   *  (spinner, no % available). Undefined once the send completes. */
  uploadPct?: number
  uploadPhase?: "uploading" | "processing"
  /** Emoji reaction the team put on this message (WhatsApp-style). */
  reaction: string | null
  fromTrainerId: string | null
  fromTrainer: { id: string; name: string } | null
  /** True when this reply came from the AI sales agent's suggestion. */
  fromAgent?: boolean
  importedAt: string | null
  createdAt: string
}

// Local media blobs for outbound photos/videos, keyed by message id (both the
// tmp_ optimistic id and, after the send, the real server id). Lives OUTSIDE
// React state on purpose: refreshDetail() replaces `detail` with the server
// payload every 10s, which would otherwise wipe the client-only localMediaUrl
// and make the freshly sent picture blank out until the proxy loads (the
// "flicker/vanish" the owner filmed on 15.07). ChatMedia falls back to this
// cache; entries are dropped once the proxy has taken over.
const localMediaCache = new Map<string, string>()

// Emoji the team can react with (long-press a message).
// 🙏 added 06.07 - Sveta asked for a "thank you" hands option (business politeness).
const REACTIONS = ["❤️", "👍", "🙏", "🔥", "🥰", "😌", "🤩", "😇", "🥳", "🤠", "🌞", "🤌"] as const

/** The AI sales agent's pending suggestion for a chat (suggest-mode).
 *  SAFE -> `draft` holds a ready reply; BOOKING/ESCALATE -> `reason` tells
 *  staff why the agent stepped aside and a human must answer. */
type AgentSuggestion = {
  id: string
  category: "SAFE" | "BOOKING" | "ESCALATE"
  draft: string | null
  reason: string | null
  createdAt: string
}

type ConversationDetail = {
  id: string
  clientPhone: string
  clientName: string | null
  assignedTrainer: Trainer | null
  accessTrainers: Trainer[]
  lastInboundAt: string | null
  lastMessageAt: string
  messages: MessageRow[]
  suggestion?: AgentSuggestion | null
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function formatPhone(p: string) {
  // Quick beautify: keep digits, group last 10 as XXX-XXXX-XXX, prepend +country
  if (!p) return ""
  if (p.length <= 4) return "+" + p
  return "+" + p.slice(0, p.length - 9) + " " + p.slice(-9, -6) + "-" + p.slice(-6, -3) + "-" + p.slice(-3)
}

// WhatsApp's Cloud API doesn't expose clients' profile photos, so we render a
// nice initial avatar instead — deterministically coloured by name/phone so
// each client is visually distinct (like a contact list).
function avatarBg(seed: string): React.CSSProperties {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return { background: `linear-gradient(135deg, hsl(${h} 42% 46%), hsl(${(h + 28) % 360} 44% 36%))` }
}

function previewText(m: ConversationListItem["lastMessage"]): string {
  if (!m) return ""
  if (m.type === "text" && m.body) return m.body
  if (m.type === "template" && m.body) return m.body
  if (m.type === "image") return "📷 Image" + (m.body ? `: ${m.body}` : "")
  if (m.type === "audio") return "🎤 Voice message"
  if (m.type === "video") return "🎬 Video"
  if (m.type === "document") return "📄 " + (m.body ?? "Document")
  if (m.type === "sticker") return "Sticker"
  return m.body ?? `[${m.type}]`
}

function StatusTick({ status }: { status: string }) {
  // WhatsApp colors: read = #53BDEB (light blue), sent/delivered = gray
  if (status === "read") return <CheckCheck size={15} className="text-[#53BDEB]" />
  if (status === "delivered")
    return <CheckCheck size={15} className="text-gray-500 dark:text-[#8696A0]" />
  if (status === "sent")
    return <Check size={15} className="text-gray-500 dark:text-[#8696A0]" />
  if (status === "failed") return <span className="text-[11px] text-red-500">!</span>
  return <Loader2 size={12} className="text-gray-400 dark:text-[#8696A0] animate-spin" />
}

function WindowBadge({ lastInboundAt }: { lastInboundAt: string | null }) {
  if (!lastInboundAt) {
    return (
      <span className="text-xs px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
        Window closed — template only
      </span>
    )
  }
  const ms = ONE_DAY_MS - (Date.now() - new Date(lastInboundAt).getTime())
  if (ms <= 0) {
    return (
      <span className="text-xs px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
        Window closed — template only
      </span>
    )
  }
  const hrs = Math.floor(ms / 3_600_000)
  const mins = Math.floor((ms % 3_600_000) / 60_000)
  return (
    <span className="text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
      Window open • {hrs}h {mins}m
    </span>
  )
}

// Render plain message text with clickable links. WhatsApp auto-links URLs but
// we store the body as plain text, so we detect http(s):// and www. URLs at
// render time and wrap them in <a>. Deliberately simple (no markdown) — a fresh
// (non-shared) regex per call avoids global-lastIndex state bugs.
const LINK_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]}'"]|www\.[^\s<]+[^\s<.,;:!?)\]}'"])/gi
function linkify(text: string) {
  const out: React.ReactNode[] = []
  const re = new RegExp(LINK_RE.source, "gi")
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const raw = m[0]
    const href = raw.startsWith("www.") ? `https://${raw}` : raw
    out.push(
      <a
        key={`${m.index}-${raw}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="underline underline-offset-2 break-all text-blue-600 dark:text-[#53BDEB]"
      >
        {raw}
      </a>,
    )
    last = m.index + raw.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// True when the text is *only* emoji (plus optional whitespace / variation
// selectors / ZWJ). Mirrors WhatsApp's "jumbo emoji" rendering rule —
// emoji-only messages get a larger font while everything else stays at the
// normal text size.
function isEmojiOnly(text: string | null | undefined): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (!trimmed.length) return false
  const stripped = trimmed.replace(
    /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}‍️\s]/gu,
    "",
  )
  return stripped.length === 0
}

// Count of standalone emoji characters in an emoji-only string. We cap the
// jumbo size when there are many emoji so they don't overflow the bubble.
function emojiCount(text: string): number {
  let count = 0
  for (const _ of text.replace(/\s+/g, "")) count++
  return count
}

// Circular loader for the media overlay. With a pct it draws an arc filling to
// that percent (upload phase); without one it spins (server->Meta phase).
function MediaSpinner({ pct }: { pct?: number }) {
  const R = 18
  const C = 2 * Math.PI * R
  const off = pct != null ? C * (1 - Math.max(0, Math.min(100, pct)) / 100) : C * 0.72
  return (
    <span className="relative inline-flex items-center justify-center w-12 h-12">
      <svg width="48" height="48" viewBox="0 0 48 48" className={pct == null ? "animate-spin" : undefined}>
        <circle cx="24" cy="24" r={R} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
        <circle
          cx="24" cy="24" r={R} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 24 24)"
        />
      </svg>
      {pct != null && (
        <span className="absolute text-[11px] font-semibold text-white tabular-nums">{Math.round(pct)}</span>
      )}
    </span>
  )
}

// Inline photo/video with a no-flicker source swap + upload overlay.
//
// No-flicker: an outbound bubble carries `localMediaUrl` (a blob: URL). We keep
// showing it even after the server row arrives; the proxy image is preloaded
// off-screen and we only switch `src` to it once it has fully loaded, then
// revoke the blob. So the pixels on screen never blank out.
//
// Overlay: while `uploadPhase` is set we dim the media and show a loader -
// real % during "uploading", a spinner during "processing" - plus a
// "Still sending…" line if the server phase drags on.
function ChatMedia({
  m,
  onImageClick,
  onImgTouchStart,
  onImgTouchEnd,
}: {
  m: MessageRow
  onImageClick?: (src: string) => void
  onImgTouchStart: (e: React.TouchEvent) => void
  onImgTouchEnd: (e: React.TouchEvent, src: string) => void
}) {
  const proxyUrl = `/api/whatsapp/media/${m.id}`
  // Client-only blob: from the row when present, else from the module cache -
  // refreshDetail() swaps in raw server rows and would otherwise lose it.
  const localUrl = m.localMediaUrl ?? localMediaCache.get(m.id) ?? null
  const hasLocal = !!localUrl
  const busy = m.uploadPhase === "uploading" || m.uploadPhase === "processing"
  const isTmp = m.id.startsWith("tmp_")
  // If there's no local blob to fall back on, the proxy is the only source, so
  // treat it as "ready" from the start (inbound media, or a reloaded page).
  const [proxyReady, setProxyReady] = useState(!hasLocal)
  // "Still sending…" appears if the server phase (processing) drags past 8s.
  const [longWait, setLongWait] = useState(false)

  // Preload the proxy once the send is done (real server id, not busy). Images
  // preload via Image(); for video we just switch when the upload finishes
  // (preloading a whole video off-screen is wasteful). On preload error we keep
  // the local blob rather than swap to a broken proxy.
  useEffect(() => {
    if (proxyReady || busy || isTmp) return
    if (m.type !== "image") { setProxyReady(true); return }
    const img = new Image()
    img.onload = () => setProxyReady(true)
    img.onerror = () => {} // keep showing the local blob
    img.src = proxyUrl
  }, [proxyReady, busy, isTmp, m.type, proxyUrl])

  // Revoke the local blob shortly after the proxy takes over (paint has
  // swapped) and drop it from the cache so future refetches render the proxy.
  useEffect(() => {
    if (!(proxyReady && localUrl) || m.id.startsWith("tmp_")) return
    const u = localUrl
    const id = m.id
    const t = setTimeout(() => {
      localMediaCache.delete(id)
      try { URL.revokeObjectURL(u) } catch {}
    }, 1500)
    return () => clearTimeout(t)
  }, [proxyReady, localUrl, m.id])

  // Arm / disarm the "Still sending…" timer with the processing phase.
  useEffect(() => {
    if (m.uploadPhase !== "processing") { setLongWait(false); return }
    const t = setTimeout(() => setLongWait(true), 8000)
    return () => clearTimeout(t)
  }, [m.uploadPhase])

  const src = proxyReady ? proxyUrl : (localUrl || proxyUrl)

  const overlay = busy && (
    <div className="absolute inset-0 flex items-center justify-center bg-black/35 rounded-xl pointer-events-none">
      <MediaSpinner pct={m.uploadPhase === "uploading" ? (m.uploadPct ?? 0) : undefined} />
    </div>
  )

  if (m.type === "video") {
    return (
      <>
        <div className="relative mb-1">
          <video
            src={src}
            controls={!busy}
            playsInline
            className="rounded-xl max-w-full max-h-72 bg-black block"
          />
          {overlay}
        </div>
        {m.uploadPhase === "processing" && longWait && (
          <div className="text-[10px] text-gray-500 dark:text-[#8696A0] mb-1">Still sending…</div>
        )}
      </>
    )
  }

  // image
  return (
    <>
      <div className="relative mb-1 inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={m.body ?? "photo"}
          draggable={false}
          onClick={(e) => { if (busy) return; e.stopPropagation(); onImageClick?.(src) }}
          onTouchStart={onImgTouchStart}
          onTouchEnd={(e) => { if (!busy) onImgTouchEnd(e, src) }}
          className={cn(
            "rounded-xl max-w-full max-h-72 object-cover bg-black/10",
            busy ? "cursor-default" : "cursor-zoom-in",
          )}
          style={{ WebkitTouchCallout: "none" }}
        />
        {overlay}
      </div>
      {m.uploadPhase === "processing" && longWait && (
        <div className="text-[10px] text-gray-500 dark:text-[#8696A0] mb-1">Still sending…</div>
      )}
    </>
  )
}

function MessageBubble({
  m,
  role,
  fontScale,
  onTranslate,
  translating = false,
  onReact,
  canReact = false,
  onCopied,
  onImageClick,
  onRetry,
}: {
  m: MessageRow
  role: "ADMIN" | "TRAINER"
  fontScale: number
  onTranslate?: (messageId: string) => void
  translating?: boolean
  /** Re-send a failed message (text only). Shown as "↻ Send again". */
  onRetry?: (m: MessageRow) => void
  onReact?: (messageId: string, emoji: string) => void
  /** Reactions only on CLIENT messages while the 24h window is open — a
   *  reaction outside the window never reaches the client (silent collision),
   *  and reacting to our own/system messages reads as the client's doing. */
  canReact?: boolean
  onCopied?: () => void
  onImageClick?: (src: string) => void
}) {
  const isOut = m.direction === "OUTBOUND"
  // WhatsApp-style action menu: long-press (touch) or right-click (desktop).
  const [menuOpen, setMenuOpen] = useState(false)
  // While true the menu plays its exit animation before unmounting.
  const [menuClosing, setMenuClosing] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openMenu = () => {
    // Clear any OS selection that may have begun before our long-press fired,
    // so the reaction menu doesn't open on top of a blue text highlight.
    try { window.getSelection?.()?.removeAllRanges() } catch {}
    setMenuClosing(false)
    setMenuOpen(true)
  }
  // Animate the menu out, then unmount it once the exit animation finishes.
  const closeMenu = () => {
    setMenuClosing(true)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      setMenuOpen(false)
      setMenuClosing(false)
    }, 200)
  }
  // Long-press start position — used to keep the timer alive through tiny
  // finger jitter (cancelling on ANY move made the menu rarely open while iOS
  // proceeded with its own selection gesture).
  const pressPos = useRef<{ x: number; y: number } | null>(null)
  const startPress = (e: React.TouchEvent) => {
    const t = e.touches[0]
    pressPos.current = t ? { x: t.clientX, y: t.clientY } : null
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => openMenu(), 450)
  }
  const movePress = (e: React.TouchEvent) => {
    if (!pressTimer.current || !pressPos.current) return
    const t = e.touches[0]
    if (!t) return
    // Only treat it as a scroll (and cancel the long-press) once the finger
    // has travelled more than ~10px — otherwise a steady hold survives jitter.
    if (Math.hypot(t.clientX - pressPos.current.x, t.clientY - pressPos.current.y) > 10) {
      cancelPress()
    }
  }
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    pressPos.current = null
  }

  const copyText = async () => {
    const text = m.body ?? m.translatedBody ?? ""
    let ok = true
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      ok = false
    }
    // Close the sheet; the parent shows a WhatsApp-style "Скопировано" toast.
    closeMenu()
    if (ok) onCopied?.()
  }

  const react = (emoji: string) => {
    // Apply the reaction immediately so the badge lands on the bubble while
    // the menu animates closed. Tapping the current reaction again clears it.
    onReact?.(m.id, m.reaction === emoji ? "" : emoji)
    closeMenu()
  }

  // Image tap → open the fullscreen viewer. On iOS the synthesized onClick is
  // unreliable inside a long-press bubble, so we detect a clean tap on
  // touchend and preventDefault to suppress the ghost click (no double-open).
  const imgTap = useRef<{ x: number; y: number; t: number } | null>(null)
  const onImgTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation() // don't arm the bubble's long-press on an image tap
    const t = e.touches[0]
    imgTap.current = t ? { x: t.clientX, y: t.clientY, t: Date.now() } : null
  }
  const onImgTouchEnd = (e: React.TouchEvent, src: string) => {
    e.stopPropagation()
    const start = imgTap.current
    imgTap.current = null
    const end = e.changedTouches[0]
    if (!start || !end) return
    const moved = Math.hypot(end.clientX - start.x, end.clientY - start.y)
    if (moved <= 12 && Date.now() - start.t <= 600) {
      e.preventDefault() // stop the ghost click from opening it twice
      onImageClick?.(src)
    }
  }
  // Display text: admins prefer the translation when the server produced one
  // (with the original shown smaller below). Trainers ALWAYS see the original
  // language — no translation, no translate button (that's an admin tool).
  const hasTranslation =
    role === "ADMIN" &&
    !!m.translatedBody && m.translatedBody.trim() !== (m.body ?? "").trim()
  const primaryText = hasTranslation ? m.translatedBody : m.body
  const jumbo = isEmojiOnly(primaryText)
  const jumboScale = jumbo
    ? emojiCount(primaryText || "") <= 3
      ? 2.8 // 1-3 emoji → big like WhatsApp
      : emojiCount(primaryText || "") <= 6
        ? 1.8 // 4-6 emoji → medium
        : 1.2 // 7+ → barely larger than normal
    : 1

  // Stickers render WITHOUT a bubble — floating on the chat background,
  // like WhatsApp. Status / time line sits just below the image.
  if (m.type === "sticker") {
    const src = m.mediaUrl?.startsWith("blob:")
      ? m.mediaUrl
      : `/api/whatsapp/media/${m.id}`
    return (
      <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
        <div className="flex flex-col" style={{ alignItems: isOut ? "flex-end" : "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="sticker"
            className="w-[140px] h-[140px] object-contain select-none"
            draggable={false}
          />
          <div className="flex items-center gap-1 mt-0.5 px-1">
            <span className="text-[11px] text-gray-500 dark:text-[#8696A0] tabular-nums">
              {format(new Date(m.createdAt), "HH:mm")}
            </span>
            {isOut && <StatusTick status={m.status} />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex relative", isOut ? "justify-end" : "justify-start", m.reaction && "mb-3")}>
      {/* Action sheet (long-press / right-click). Centered overlay with a dim
          backdrop — like WhatsApp — so reactions never clip at screen edges.
          Reaction row scrolls horizontally on one line; the menu below has
          just Copy + Delete (Delete only for our unread sent messages). */}
      {menuOpen && (
        <div
          className={cn(
            "reaction-menu fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6",
            menuClosing ? "animate-bg-fade-out" : "animate-bg-fade-in",
          )}
          onClick={() => closeMenu()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="flex flex-col items-stretch gap-2 w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Reaction bar — springs up; emojis pop in one after another.
                Hidden when reacting isn't allowed (window closed / not a
                client message) — the menu still offers copy/translate. */}
            {canReact && <div className={cn(
              "flex items-center gap-1 overflow-x-auto no-scrollbar rounded-full bg-white dark:bg-[#233138] shadow-xl px-2 py-2",
              menuClosing ? "animate-reaction-pill-out" : "animate-reaction-pill-in",
            )}>
              {REACTIONS.map((e, i) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => react(e)}
                  style={{ animationDelay: `${80 + i * 22}ms` }}
                  className={cn(
                    "flex-shrink-0 text-2xl leading-none w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-transform animate-emoji-pop",
                    m.reaction === e && "bg-gray-100 dark:bg-white/10",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>}

            {/* Menu — Copy only (WhatsApp Cloud API has no recall, so there's
                no real Delete to offer). Scales in just after the pill. */}
            <div className={cn(
              "rounded-2xl bg-white dark:bg-[#233138] shadow-xl overflow-hidden",
              menuClosing ? "animate-menu-pop-out" : "animate-menu-pop-in",
            )}>
              <button
                type="button"
                onClick={copyText}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5"
              >
                Copy
                <span aria-hidden>📋</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        onContextMenu={(e) => { e.preventDefault(); openMenu() }}
        onTouchStart={startPress}
        onTouchEnd={cancelPress}
        onTouchCancel={cancelPress}
        onTouchMove={movePress}
        className={cn(
          "relative max-w-[78%] rounded-2xl leading-snug shadow-sm select-none",
          jumbo ? "px-2.5 py-1.5" : "px-3 py-2",
          // WhatsApp bubble colors — light theme + dark theme via prefers-color-scheme.
          // Agent replies get a violet tint (owner 16.07: staff must instantly
          // see which bubbles the agent sent).
          isOut
            ? m.fromAgent
              ? "bg-[#EDE4FA] text-gray-900 ring-1 ring-violet-300/60 dark:bg-[#3B2E58] dark:text-white dark:ring-violet-400/30"
              : "bg-[#DCF8C6] text-gray-900 dark:bg-[#005C4B] dark:text-white"
            : "bg-white text-gray-900 border border-gray-100 dark:bg-[#1F2C34] dark:text-white dark:border-transparent",
          m.importedAt && "opacity-80",
        )}
        style={{ fontSize: `${fontScale * 0.875}rem`, WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      >
        {/* Reaction badge — pill hanging off the bottom of the bubble. Keyed by
            the emoji so it remounts and replays the "land" bounce each time the
            reaction changes, making it clear which message it's attached to. */}
        {m.reaction && (
          <div
            key={m.reaction}
            className={cn(
              "absolute -bottom-3 flex items-center justify-center w-7 h-7 rounded-full bg-white dark:bg-[#233138] shadow-md border border-gray-100 dark:border-white/10 text-base animate-reaction-land z-10",
              isOut ? "left-1" : "right-1",
            )}
          >
            {m.reaction}
          </div>
        )}
        {m.type === "template" && (
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium mb-1 flex items-center gap-1">
            <Sparkles size={11} /> {m.templateName ?? "Template"}
          </div>
        )}

        {/* Inline media (photo/video/sticker) with a no-flicker source swap and
            an upload-progress overlay. See ChatMedia. */}
        {(m.type === "image" || m.type === "video") && (
          <ChatMedia
            m={m}
            onImageClick={onImageClick}
            onImgTouchStart={onImgTouchStart}
            onImgTouchEnd={onImgTouchEnd}
          />
        )}
        {m.type === "audio" && (
          <audio
            src={m.mediaUrl?.startsWith("blob:") ? m.mediaUrl : `/api/whatsapp/media/${m.id}`}
            controls
            className="mb-1 max-w-full"
          />
        )}
        {m.type === "document" && (
          <a
            href={m.mediaUrl?.startsWith("blob:") ? m.mediaUrl : `/api/whatsapp/media/${m.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-blue-600 dark:text-[#53BDEB] underline-offset-2 hover:underline mb-1"
          >
            📄 {m.body ?? "document"}
          </a>
        )}

        {primaryText && m.type !== "document" && (
          <div
            className="whitespace-pre-wrap break-words"
            style={
              jumbo
                ? // Jumbo emoji-only — much larger than the bubble text.
                  { fontSize: `${jumboScale * 1.8}em`, lineHeight: 1.1 }
                : undefined
            }
          >
            {linkify(primaryText)}
          </div>
        )}

        {/* Translation footer: if the server translated this message we
            show the original underneath in muted text, labelled with the
            detected language. For outbound this surfaces what the client
            actually received in their language; for inbound it surfaces
            what the client wrote before translation. */}
        {hasTranslation && m.body && (
          <div
            className={cn(
              "mt-1 text-[11px] whitespace-pre-wrap break-words border-t pt-1",
              isOut
                ? "border-emerald-700/30 text-gray-600 dark:text-emerald-200/70"
                : "border-gray-200 text-gray-500 dark:border-white/10 dark:text-[#8696A0]",
            )}
          >
            <span className="opacity-60 mr-1">
              {isOut ? "→" : "🌐"}
              {m.detectedLang ? ` ${m.detectedLang.toUpperCase()}:` : ""}
            </span>
            {linkify(m.body)}
            {m.translatedVia && (
              <span className="ml-1.5 opacity-50 uppercase tracking-wide text-[9px]">
                · {m.translatedVia}
              </span>
            )}
          </div>
        )}

        {/* Who answered — persists across reassignment (stored per message).
            Shown to admins and trainers alike: trainer name for a trainer's
            reply, "Admin" for an admin's typed reply. */}
        {m.fromAgent && isOut ? (
          /* Owner 15.07: everyone must SEE a reply came from the agent. */
          <div className="text-[10px] text-gray-500 mt-1 italic">— Agent 🤖</div>
        ) : m.fromTrainer && isOut ? (
          <div className="text-[10px] text-gray-500 mt-1 italic">— {m.fromTrainer.name}</div>
        ) : !m.fromTrainer && isOut && m.type === "text" ? (
          <div className="text-[10px] text-gray-500 mt-1 italic">— Admin</div>
        ) : null}

        {/* On-demand translate for client (inbound) messages — admin only.
            Hidden once a translation exists (it's already shown above). */}
        {!isOut && role === "ADMIN" && onTranslate && !hasTranslation &&
          (m.type === "text" || m.type === "image" || m.type === "video") &&
          !!(m.body && m.body.trim()) && (
            <button
              type="button"
              onClick={() => onTranslate(m.id)}
              disabled={translating}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand hover:underline disabled:opacity-50"
            >
              🌐 {translating ? "Translating…" : "Translate"}
            </button>
          )}

        {/* Failed send. We deliberately DON'T surface Meta's raw error
            ("An unknown error has occurred." etc.) — it's noise to staff.
            A neutral "Not delivered" plus a one-tap re-send covers the real
            cause (a transient Meta outage on an open window). Retry is text
            only; templates/media re-send needs the original params we don't
            keep on the bubble. The 24h-window-closed case never reaches here
            because the composer disables typing while the window is shut. */}
        {m.status === "failed" && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] text-red-500">Not delivered</span>
            {onRetry && m.type === "text" && !!(m.body && m.body.trim()) && (
              <button
                type="button"
                onClick={() => onRetry(m)}
                className="text-[10px] text-brand hover:underline"
              >
                ↻ Send again
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-1 mt-1 -mr-1">
          <span className="text-[11px] text-gray-500 dark:text-[#8696A0] tabular-nums">
            {format(new Date(m.createdAt), "HH:mm")}
          </span>
          {isOut && <StatusTick status={m.status} />}
        </div>
      </div>
    </div>
  )
}

// Telegram-style day label for date separators / the floating date pill.
function dayLabel(d: Date): string {
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  // Same-year dates omit the year (e.g. "1 June"); older ones include it.
  return d.getFullYear() === new Date().getFullYear()
    ? format(d, "d MMMM")
    : format(d, "d MMMM yyyy")
}

// Group consecutive messages by calendar day for inline date separators.
function groupMessagesByDay(messages: MessageRow[]): { key: string; label: string; messages: MessageRow[] }[] {
  const groups: { key: string; label: string; messages: MessageRow[] }[] = []
  for (const m of messages) {
    const d = new Date(m.createdAt)
    const key = format(d, "yyyy-MM-dd")
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.messages.push(m)
    else groups.push({ key, label: dayLabel(d), messages: [m] })
  }
  return groups
}

// Centered rounded date pill shown inline between day groups.
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-1.5">
      <span className="px-3 py-1 rounded-full text-[11px] font-medium text-gray-600 dark:text-gray-200 bg-white/70 dark:bg-[#1F2C34]/80 backdrop-blur-sm shadow-sm">
        {label}
      </span>
    </div>
  )
}

export default function Inbox({
  role,
  embedded = false,
  onClose,
  initialSelectedId = null,
}: {
  role: "ADMIN" | "TRAINER"
  /** When true, the Inbox tracks its own selection in component state and
   *  doesn't write to the URL. Use this when the Inbox lives inside a modal
   *  that may be closed/reopened independently of navigation. */
  embedded?: boolean
  /** Optional close handler. When provided, an X button is rendered in the
   *  list-column header (only meaningful in embedded mode). */
  onClose?: () => void
  /** Embedded mode: open straight onto this conversation (e.g. when the
   *  modal is launched from a booking's "Open chat" button). */
  initialSelectedId?: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [embeddedSelectedId, setEmbeddedSelectedId] = useState<string | null>(initialSelectedId)
  // If a fresh conversation is requested while the modal is already mounted,
  // jump to it.
  useEffect(() => {
    if (embedded && initialSelectedId) setEmbeddedSelectedId(initialSelectedId)
  }, [embedded, initialSelectedId])
  const selectedId = embedded ? embeddedSelectedId : searchParams.get("c")

  // PAGE variant on a phone: when a chat is open and iOS shows the keyboard,
  // Safari scrolls the page and the dvh-sized shell "floats" (huge dead gap
  // under the keyboard — Gr's report 2026-06-12). Mirror the FloatingInbox
  // trick: track the visual viewport and pin the shell to it as fixed.
  const [pageVv, setPageVv] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  useEffect(() => {
    if (embedded || !selectedId) { setPageVv(null); return }
    if (typeof window === "undefined") return
    // Desktop keeps the static layout — only narrow/coarse screens need this.
    if (window.matchMedia("(min-width: 1024px)").matches) { setPageVv(null); return }
    const visual = window.visualViewport
    if (!visual) return
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Only engage when the keyboard actually shrinks the viewport —
        // otherwise keep normal page flow (top bar visible, no jumps).
        const vvShrunk = visual.height < window.innerHeight - 80
        setPageVv(vvShrunk ? { x: visual.offsetLeft, y: visual.offsetTop, w: visual.width, h: visual.height } : null)
        if (vvShrunk) window.scrollTo(0, 0)
      })
    }
    update()
    visual.addEventListener("resize", update)
    return () => {
      cancelAnimationFrame(raf)
      visual.removeEventListener("resize", update)
    }
  }, [embedded, selectedId])

  // Hydrate the list from the local cache SYNCHRONOUSLY on the first render so
  // the inbox opens already populated (WhatsApp/Telegram style) - refreshList()
  // then reconciles in the background. "Loading…" now only shows on a genuinely
  // cold cache (very first visit on this device).
  const [convos, setConvos] = useState<ConversationListItem[] | null>(
    () => readListCache<ConversationListItem[]>(role),
  )
  const [search, setSearch] = useState("")
  // Chat-list filter by booking day: all chats / booked today / booked tomorrow.
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "tomorrow" | "awaiting">("all")
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [sendError, setSendError] = useState<string | null>(null)
  // --- AI sales agent (suggest-mode) ---
  // Card above the composer with the agent's pending draft. `hidden` keeps a
  // consumed/being-edited card from flashing back on the next detail refresh.
  const [hiddenSuggestionId, setHiddenSuggestionId] = useState<string | null>(null)
  const [composerPrefill, setComposerPrefill] = useState<{ text: string; nonce: number } | null>(null)
  const pendingSuggestionIdRef = useRef<string | null>(null)

  const dismissSuggestion = useCallback(async (sug: AgentSuggestion) => {
    setHiddenSuggestionId(sug.id)
    setDetail((prev) => (prev?.suggestion?.id === sug.id ? { ...prev, suggestion: null } : prev))
    if (!detail) return
    try {
      await fetch(`/api/whatsapp/conversations/${detail.id}/suggestion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId: sug.id, action: "dismiss" }),
      })
    } catch {}
  }, [detail])

  const editSuggestion = useCallback((sug: AgentSuggestion) => {
    if (!sug.draft) return
    pendingSuggestionIdRef.current = sug.id
    setHiddenSuggestionId(sug.id)
    setDetail((prev) => (prev?.suggestion?.id === sug.id ? { ...prev, suggestion: null } : prev))
    setComposerPrefill({ text: sug.draft, nonce: Date.now() })
  }, [])
  const [assignOpen, setAssignOpen] = useState(false)
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())
  // Timestamp of the last copy — drives the WhatsApp-style "Скопировано" toast.
  // A changing value remounts the toast so its animation replays each copy.
  const [copiedAt, setCopiedAt] = useState(0)
  // Full-screen image viewer (lightbox). Null = closed.
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  // Telegram-style floating date pill: shows the topmost visible day while
  // scrolling, fades out shortly after scrolling stops.
  const [floatingDate, setFloatingDate] = useState<string | null>(null)
  const [floatingVisible, setFloatingVisible] = useState(false)
  const floatingHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Trainer 👋 wave: rate-limited to once per 12h per conversation (stored in
  // localStorage). waveLockUntil = timestamp the button reactivates, or null.
  const [waveLockUntil, setWaveLockUntil] = useState<number | null>(null)
  // Chat "class action" (calendar-x by the input, Canggu rollout): this
  // client's upcoming bookings + the studio slug that gates the button.
  const [classInfo, setClassInfo] = useState<{ studioSlug: string | null; bookings: ChatBooking[] } | null>(null)
  const [classSheetOpen, setClassSheetOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  // Mobile WhatsApp-style on-screen keyboard: hidden until the user taps the
  // input; dragging the thread down dismisses it. All state + CSS vars + the
  // drag gesture live in this hook (single owner). Desktop ignores it.
  const kb = useKeyboardSheet({ threadRef: messagesScrollRef, resetKey: detail?.id })
  // True briefly right after a chat opens (during the programmatic jump to
  // bottom) so the floating date pill doesn't flash on load.
  const justOpenedRef = useRef(false)

  // Close the full-screen image viewer on Escape.
  useEffect(() => {
    if (!lightboxSrc) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxSrc(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightboxSrc])

  // Messages grouped by calendar day → inline date separators.
  const messageGroups = useMemo(
    () => groupMessagesByDay(detail?.messages ?? []),
    [detail?.messages],
  )

  // Floating date pill: on scroll, find the day-section currently at the top of
  // the viewport and show its label; hide ~1.2s after scrolling stops.
  const handleMessagesScroll = useCallback(() => {
    const c = messagesScrollRef.current
    if (!c) return
    // Ignore the programmatic jump-to-bottom that fires right after a chat
    // opens — otherwise the floating date pill flashes during load.
    if (justOpenedRef.current) return
    const sections = c.querySelectorAll<HTMLElement>("[data-day-label]")
    const cTop = c.getBoundingClientRect().top
    let label: string | null = null
    for (const s of sections) {
      // The section header crossed (or sits just below) the top edge.
      if (s.getBoundingClientRect().top - cTop <= 16) {
        label = s.getAttribute("data-day-label")
      } else {
        break
      }
    }
    if (!label && sections.length) label = sections[0].getAttribute("data-day-label")
    if (label) setFloatingDate(label)
    setFloatingVisible(true)
    if (floatingHideTimer.current) clearTimeout(floatingHideTimer.current)
    floatingHideTimer.current = setTimeout(() => setFloatingVisible(false), 1200)
  }, [])

  // Font-scale toggle for the inbox. 5 steps so the difference between adjacent
  // sizes is meaningful but the extremes don't break the layout. Persisted to
  // localStorage so each user keeps their preference across sessions.
  const FONT_STEPS = [0.85, 0.95, 1.05, 1.2, 1.4] as const
  const [fontStep, setFontStep] = useState<number>(2) // default = "1.05" (medium-large)
  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("wa-inbox-font") : null
    if (raw !== null) {
      const n = parseInt(raw, 10)
      if (!Number.isNaN(n) && n >= 0 && n < FONT_STEPS.length) setFontStep(n)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const setFontStepPersist = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(FONT_STEPS.length - 1, next))
    setFontStep(clamped)
    try {
      window.localStorage.setItem("wa-inbox-font", String(clamped))
    } catch {}
  }, [])
  const fontScale = FONT_STEPS[fontStep]

  // Load list
  const refreshList = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/conversations", { cache: "no-store" })
      if (r.ok) {
        const list = (await r.json()) as ConversationListItem[]
        setConvos(list)
        writeListCache(role, list)
      }
    } catch {}
  }, [role])

  // "Mark all read": zero the admin unread backlog in one tap, then refresh so
  // the list + the app-icon badge (both read unreadAdmin) drop to zero.
  const [markingAll, setMarkingAll] = useState(false)
  const markAllRead = useCallback(async () => {
    setMarkingAll(true)
    try {
      await fetch("/api/whatsapp/conversations/read-all", { method: "POST" })
      await refreshList()
    } catch {} finally {
      setMarkingAll(false)
    }
  }, [refreshList])
  useEffect(() => {
    refreshList()
    // Polling is now only a SAFETY-NET behind the SSE stream (owner 15.07:
    // "связь без дёрганья"). The stream pushes changes in real time; this rare
    // 60s tick just covers a dropped/blocked stream. Visible-tab only.
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      refreshList()
    }
    const t = setInterval(tick, 60_000)
    const onVis = () => { if (document.visibilityState === "visible") refreshList() }
    document.addEventListener("visibilitychange", onVis)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis) }
  }, [refreshList])

  // Load trainers list for admin reassign
  useEffect(() => {
    if (role !== "ADMIN") return
    fetch("/api/admin/trainers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Trainer[]) => setTrainers(d ?? []))
      .catch(() => {})
  }, [role])

  // Load conversation detail when selectedId changes
  const refreshDetail = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/whatsapp/conversations/${id}`, { cache: "no-store" })
      if (r.ok) {
        const d = (await r.json()) as ConversationDetail
        // MERGE, don't clobber: the server doesn't know about in-flight
        // optimistic sends (tmp_ rows) and never carries client-only fields
        // (localMediaUrl / upload progress). A raw setDetail(d) here used to
        // vanish a just-sent photo mid-upload and blank it after the swap
        // (owner's screen recording, 15.07).
        setDetail((prev) => {
          if (!prev || prev.id !== d.id) return d
          const inFlight = prev.messages.filter(
            (m) => m.id.startsWith("tmp_") && !d.messages.some((sm) => sm.id === m.id),
          )
          const merged = d.messages.map((sm) => {
            const local = localMediaCache.get(sm.id)
            return local ? { ...sm, localMediaUrl: local } : sm
          })
          return { ...d, messages: [...merged, ...inFlight] }
        })
        // Persist the fresh server snapshot for instant re-open. We cache the
        // raw server payload (no tmp_/blob rows) - those are re-merged live.
        writeDetailCache(role, id, d)
      } else if (r.status === 403 || r.status === 404) {
        setDetail(null)
      }
    } catch {}
  }, [role])
  // Class-action data: the selected client's upcoming bookings (+ studio slug
  // gating the composer button). Refetched on chat open and after move/cancel.
  const refreshClassInfo = useCallback(async () => {
    if (!selectedId) {
      setClassInfo(null)
      return
    }
    try {
      const r = await fetch(`/api/whatsapp/conversations/${selectedId}/bookings`, { cache: "no-store" })
      setClassInfo(r.ok ? await r.json() : null)
    } catch {
      setClassInfo(null)
    }
  }, [selectedId])
  useEffect(() => {
    setClassSheetOpen(false)
    void refreshClassInfo()
  }, [refreshClassInfo])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    // Instant open: paint the cached chat immediately, then reconcile. The
    // spinner shows only when this chat has never been cached on this device.
    const cached = readDetailCache<ConversationDetail>(role, selectedId)
    if (cached && cached.id === selectedId) {
      setDetail(cached)
      setLoadingDetail(false)
      void refreshDetail(selectedId)
    } else {
      setDetail(null)
      setLoadingDetail(true)
      setHiddenSuggestionId(null)
      setComposerPrefill(null)
      pendingSuggestionIdRef.current = null
      refreshDetail(selectedId).finally(() => setLoadingDetail(false))
    }
    // Safety-net poll behind the SSE stream (real-time push drives updates
    // now). Visible-tab only; 60s is just a backstop for a dropped stream.
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      refreshDetail(selectedId)
    }
    const t = setInterval(tick, 60_000)
    const onVis = () => { if (document.visibilityState === "visible") refreshDetail(selectedId) }
    document.addEventListener("visibilitychange", onVis)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis) }
  }, [selectedId, refreshDetail])

  // Real-time push (SSE): one held-open connection replaces polling. On a
  // `changed` event we refresh the list and, if a chat is open, its detail -
  // both hit the cache-through path, so the UI updates instantly and stays
  // warm. Refs keep the handler current without reopening the stream on every
  // chat switch. EventSource auto-reconnects (incl. our ~50s self-close).
  const refreshListRef = useRef(refreshList)
  const refreshDetailRef = useRef(refreshDetail)
  const selectedIdRef = useRef(selectedId)
  refreshListRef.current = refreshList
  refreshDetailRef.current = refreshDetail
  selectedIdRef.current = selectedId
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return
    let es: EventSource | null = null
    let stopped = false
    const open = () => {
      if (stopped) return
      es = new EventSource("/api/whatsapp/stream")
      es.addEventListener("changed", () => {
        refreshListRef.current()
        const id = selectedIdRef.current
        if (id) refreshDetailRef.current(id)
      })
      es.onerror = () => {
        // Browser retries automatically per our `retry:` hint; if it hard-
        // closed, reopen shortly. Guard against duplicate reopen loops.
        if (es && es.readyState === EventSource.CLOSED && !stopped) {
          es.close()
          setTimeout(open, 3000)
        }
      }
    }
    open()
    return () => { stopped = true; es?.close() }
  }, [])

  // Background prefetch: after the list loads, quietly warm the cache for the
  // most recent chats so even the FIRST open of the day is instant (like a
  // messenger that has already synced). One-time per session, sequential with
  // a small gap so we don't stampede the function; skips chats already cached.
  const prefetchedRef = useRef(false)
  useEffect(() => {
    if (prefetchedRef.current || !convos || convos.length === 0) return
    prefetchedRef.current = true
    const ids = convos.slice(0, 15).map((c) => c.id).filter((id) => id !== selectedId)
    let cancelled = false
    ;(async () => {
      for (const id of ids) {
        if (cancelled) return
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return
        if (readDetailCache<ConversationDetail>(role, id)) continue // already warm
        try {
          const r = await fetch(`/api/whatsapp/conversations/${id}`, { cache: "no-store" })
          if (r.ok) writeDetailCache(role, id, await r.json())
        } catch {}
        await new Promise((res) => setTimeout(res, 250))
      }
    })()
    return () => { cancelled = true }
  }, [convos, role, selectedId])

  // Jump to the latest message. useLayoutEffect runs BEFORE the browser
  // paints, so the chat opens already pinned to the bottom — no visible
  // "load at top then scroll down" flicker. We also flag the open so the
  // floating date pill doesn't flash during this programmatic scroll.
  useLayoutEffect(() => {
    const el = messagesScrollRef.current
    if (!el) return
    justOpenedRef.current = true
    el.scrollTop = el.scrollHeight
    const t = setTimeout(() => { justOpenedRef.current = false }, 350)
    return () => clearTimeout(t)
  }, [selectedId, detail?.messages.length])

  // (Composer owns the textarea, its focus, and its auto-grow logic now —
  // see app/_components/Composer.tsx. The "always-on caret" and
  // "expand-up-to-3-lines" behaviours moved with it.)

  const openConvo = (id: string) => {
    if (embedded) {
      setEmbeddedSelectedId(id)
      return
    }
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("c", id)
    router.push(`?${params.toString()}`)
  }
  const closeConvo = () => {
    if (embedded) {
      setEmbeddedSelectedId(null)
      return
    }
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.delete("c")
    router.push(params.toString() ? `?${params.toString()}` : "?")
  }

  const send = useCallback(async (draft: string, agentSuggestionId?: string) => {
    if (!detail || !draft.trim()) return
    // Edit flow: the composer was prefilled from an agent suggestion - the
    // eventual plain onSend(text) must still close that suggestion.
    const sugId = agentSuggestionId ?? pendingSuggestionIdRef.current
    pendingSuggestionIdRef.current = null
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    // ---- Optimistic UI ----
    // Push a pending bubble into the thread immediately so the message
    // appears in the chat the instant the user hits Send (and the input
    // clears straight away). The server round-trip happens in the
    // background; when it lands we either replace the bubble's id/status
    // with the real row, or mark it as failed so the user can retry.
    const optimisticMsg: MessageRow = {
      id: tempId,
      direction: "OUTBOUND",
      type: "text",
      body: draft,
      // Optimistic bubble has no translation yet — the server fills these
      // in on response (if the studio has inboxLanguage set and the client's
      // language differs). The bubble then re-renders with the translation.
      translatedBody: null,
      detectedLang: null,
      mediaUrl: null,
      mediaMime: null,
      templateName: null,
      status: "queued",
      errorDetail: null,
      reaction: null,
      fromTrainerId: null,
      fromTrainer: null,
      fromAgent: !!sugId,
      importedAt: null,
      createdAt: new Date().toISOString(),
    }
    // Sending an agent suggestion consumes its card immediately (the server
    // marks it sent/edited_sent; on failure the card simply comes back with
    // the next detail refresh).
    if (sugId) {
      setHiddenSuggestionId(sugId)
      setDetail((prev) => (prev?.suggestion?.id === sugId ? { ...prev, suggestion: null } : prev))
    }
    // Composer owns the textarea state and clears its own value when it
    // calls onSend(draft); we just append the optimistic bubble and run
    // the network request.
    setDetail((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : prev,
    )
    setSendError(null)
    // Scroll to the bottom so the new bubble is visible.
    requestAnimationFrame(() => {
      const el = messagesScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })

    try {
      const r = await fetch(`/api/whatsapp/conversations/${detail.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft, ...(sugId ? { agentSuggestionId: sugId } : {}) }),
      })
      const data = (await r.json().catch(() => ({}))) as {
        message?: MessageRow
        error?: string
      }
      if (!r.ok) {
        setSendError(data.error || `HTTP ${r.status}`)
        // Mark the optimistic bubble as failed but keep it in the thread.
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === tempId
                    ? { ...m, status: "failed", errorDetail: data.error ?? `HTTP ${r.status}` }
                    : m,
                ),
              }
            : prev,
        )
      } else {
        // Replace the optimistic bubble with the server row so we get the
        // real id, wamid, and any later status updates correlate correctly.
        setDetail((prev) =>
          prev && data.message
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === tempId ? (data.message as MessageRow) : m,
                ),
              }
            : prev,
        )
        // Refresh the sidebar (last-message preview / order) in the
        // background — no UI block.
        refreshList()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSendError(msg)
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === tempId ? { ...m, status: "failed", errorDetail: msg } : m,
              ),
            }
          : prev,
      )
    }
  }, [detail, refreshList])

  // Re-send a failed message in one tap (the "↻ Send again" button). Text
  // only — that's what staff actually type and what hits a transient Meta
  // outage. We drop the optimistic failed bubble first so the retry replaces
  // it rather than stacking a duplicate; a server-persisted failure (real id,
  // marked failed by a later webhook) keeps its history row and just gets a
  // fresh attempt below.
  const retryMessage = useCallback(
    (m: MessageRow) => {
      if (m.type !== "text" || !m.body?.trim()) return
      if (m.id.startsWith("tmp_")) {
        setDetail((prev) =>
          prev ? { ...prev, messages: prev.messages.filter((x) => x.id !== m.id) } : prev,
        )
      }
      void send(m.body)
    },
    [send],
  )

  // --- Trainer 👋 wave (rate-limited once / 12h per conversation) ----------
  const WAVE_COOLDOWN_MS = 12 * 60 * 60 * 1000
  // Re-evaluate the cooldown whenever the open conversation changes.
  useEffect(() => {
    if (typeof window === "undefined" || !detail) { setWaveLockUntil(null); return }
    const raw = window.localStorage.getItem(`wave:${detail.id}`)
    const last = raw ? parseInt(raw, 10) : 0
    const until = last + WAVE_COOLDOWN_MS
    setWaveLockUntil(until > Date.now() ? until : null)
  }, [detail?.id, WAVE_COOLDOWN_MS])

  const waveDisabled = !!(waveLockUntil && waveLockUntil > Date.now())

  // --- Quick-reply templates cooldown (same pattern as the wave) -----------
  // One tap can template-message a quiet client; without a lock a second
  // accidental tap spams them (owner 15.07: "I could send these unlimited by
  // mistake"). Once per 12h per conversation, tracked in localStorage.
  const [qrLockUntil, setQrLockUntil] = useState<number | null>(null)
  useEffect(() => {
    if (typeof window === "undefined" || !detail) { setQrLockUntil(null); return }
    const raw = window.localStorage.getItem(`qr:${detail.id}`)
    const last = raw ? parseInt(raw, 10) : 0
    const until = last + WAVE_COOLDOWN_MS
    setQrLockUntil(until > Date.now() ? until : null)
  }, [detail?.id, WAVE_COOLDOWN_MS])
  const quickReplyDisabled = !!(qrLockUntil && qrLockUntil > Date.now())
  // Composer reports a successful quick-reply send → arm the lock.
  const onQuickReplySent = useCallback(() => {
    if (!detail) return
    const now = Date.now()
    try { window.localStorage.setItem(`qr:${detail.id}`, String(now)) } catch {}
    setQrLockUntil(now + WAVE_COOLDOWN_MS)
  }, [detail, WAVE_COOLDOWN_MS])

  // Send a Meta-approved template (quick replies). Unlike free text, this
  // works even when the 24h customer-service window is closed.
  const sendTemplate = useCallback(async (t: {
    templateName: string
    languageCode?: string
    variables?: string[]
    display?: string
  }) => {
    if (!detail) return
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const display = t.display
      ?? `[${t.templateName}]${t.variables?.length ? " " + t.variables.join(" | ") : ""}`
    const optimisticMsg: MessageRow = {
      id: tempId,
      direction: "OUTBOUND",
      type: "template",
      body: display,
      translatedBody: null,
      detectedLang: null,
      mediaUrl: null,
      mediaMime: null,
      templateName: t.templateName,
      status: "queued",
      errorDetail: null,
      reaction: null,
      fromTrainerId: null,
      fromTrainer: null,
      importedAt: null,
      createdAt: new Date().toISOString(),
    }
    setDetail((prev) => prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : prev)
    setSendError(null)
    requestAnimationFrame(() => {
      const el = messagesScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })

    try {
      const r = await fetch(`/api/whatsapp/conversations/${detail.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: t.templateName,
          languageCode: t.languageCode ?? "en",
          variables: t.variables ?? [],
          display,
        }),
      })
      const data = (await r.json().catch(() => ({}))) as { message?: MessageRow; error?: string }
      if (!r.ok) {
        setSendError(data.error || `HTTP ${r.status}`)
        setDetail((prev) => prev ? {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === tempId ? { ...m, status: "failed", errorDetail: data.error ?? `HTTP ${r.status}` } : m,
          ),
        } : prev)
      } else {
        setDetail((prev) => prev && data.message ? {
          ...prev,
          messages: prev.messages.map((m) => (m.id === tempId ? (data.message as MessageRow) : m)),
        } : prev)
        refreshList()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSendError(msg)
      setDetail((prev) => prev ? {
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === tempId ? { ...m, status: "failed", errorDetail: msg } : m,
        ),
      } : prev)
    }
  }, [detail, refreshList])

  // The trainer's 👋 button literally sends a wave emoji into the chat —
  // nothing else (no "Greetings, <name>!" text). When the 24h window is open a
  // plain 👋 text message does the job; when it's closed we must go through a
  // Meta-approved template, so we use the `wave` template whose body is itself
  // just the 👋 emoji. Rate-limited to once / 12h per conversation.
  const sendWave = useCallback(() => {
    if (!detail || (waveLockUntil && waveLockUntil > Date.now())) return
    const open = detail.lastInboundAt
      ? Date.now() - new Date(detail.lastInboundAt).getTime() < ONE_DAY_MS
      : false
    if (open) {
      void send("👋")
    } else {
      void sendTemplate({ templateName: "wave", languageCode: "en", display: "👋" })
    }
    const now = Date.now()
    try { window.localStorage.setItem(`wave:${detail.id}`, String(now)) } catch {}
    setWaveLockUntil(now + WAVE_COOLDOWN_MS)
  }, [detail, waveLockUntil, send, sendTemplate, WAVE_COOLDOWN_MS])

  // Send a photo/video. Optimistic bubble uses a local objectURL so the
  // image shows up instantly while the server uploads to Meta and dispatches
  // the message.
  const sendMedia = useCallback(
    async (file: File) => {
      if (!detail) return
      const isWebp = file.type === "image/webp" || /\.webp$/i.test(file.name)
      const guessType: MessageRow["type"] = isWebp
        ? "sticker"
        : file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
            ? "audio"
            : file.type.startsWith("image/")
              ? "image"
              : "document"
      // WhatsApp's own per-type media caps. Reject oversized files up front with
      // a clear message instead of letting Blob/Meta bounce them with a raw error
      // (e.g. a >16MB video). Photo 5MB, video/audio 16MB, document 100MB.
      // TRAINER media rides the Google Drive bridge (originals, no WhatsApp
      // compression), so the only cap is the server's 100MB sanity ceiling.
      const WA_LIMIT_MB: Record<string, number> = { image: 5, video: 16, audio: 16, document: 100, sticker: 0.5 }
      const limitMb = role === "TRAINER" ? 100 : (WA_LIMIT_MB[guessType] ?? 16)
      if (file.size > limitMb * 1024 * 1024) {
        const niceType = guessType === "sticker" ? "sticker" : guessType
        setSendError(`This ${niceType} is ${(file.size / 1024 / 1024).toFixed(0)}MB - the limit is ${limitMb}MB. Trim or compress it and try again.`)
        return
      }
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const localUrl = URL.createObjectURL(file)
      localMediaCache.set(tempId, localUrl)
      const optimistic: MessageRow = {
        id: tempId,
        direction: "OUTBOUND",
        type: guessType,
        body: null,
        translatedBody: null,
        detectedLang: null,
        mediaUrl: localUrl,
        mediaMime: file.type,
        templateName: null,
        status: "queued",
        errorDetail: null,
        reaction: null,
        fromTrainerId: null,
        fromTrainer: null,
        importedAt: null,
        createdAt: new Date().toISOString(),
        // Instant, flicker-free preview: the bubble shows this blob and keeps
        // showing it until the proxy image has preloaded (see ChatMedia).
        localMediaUrl: localUrl,
        uploadPct: 0,
        uploadPhase: "uploading",
      }
      setDetail((prev) =>
        prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev,
      )
      setSendError(null)
      requestAnimationFrame(() => {
        const el = messagesScrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })

      // Patch just this optimistic bubble (progress %, phase, status, ...).
      const patch = (fields: Partial<MessageRow>) =>
        setDetail((prev) =>
          prev
            ? { ...prev, messages: prev.messages.map((m) => (m.id === tempId ? { ...m, ...fields } : m)) }
            : prev,
        )
      // Throttle progress writes to whole-percent changes (avoids a re-render
      // per network chunk).
      let lastPct = -1
      const onPct = (pct: number) => {
        const p = Math.max(0, Math.min(100, Math.round(pct)))
        if (p === lastPct) return
        lastPct = p
        patch({ uploadPct: p, uploadPhase: "uploading" })
      }

      try {
        // Vercel serverless caps the request body at ~4.5 MB, which a phone
        // video blows past. For anything sizeable, stream it straight to Vercel
        // Blob first and hand the media route just the URL; small photos still
        // take the simple multipart path.
        const BLOB_THRESHOLD = 4 * 1024 * 1024
        let ok = false
        let statusCode = 0
        let data: { message?: MessageRow; error?: string } = {}

        if (file.size > BLOB_THRESHOLD) {
          // Phone->Blob is the measurable upload; report its % live.
          const blob = await upload(file.name || "upload", file, {
            access: "public",
            handleUploadUrl: `/api/whatsapp/conversations/${detail.id}/blob-upload`,
            contentType: file.type || undefined,
            onUploadProgress: (e) => onPct(e.percentage),
          })
          // Blob done; the server now pulls it and hands it to Meta - no % for
          // that leg, so switch to the indeterminate spinner.
          patch({ uploadPct: 100, uploadPhase: "processing" })
          const r = await fetch(`/api/whatsapp/conversations/${detail.id}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blobUrl: blob.url, mime: file.type, filename: file.name }),
          })
          ok = r.ok
          statusCode = r.status
          data = (await r.json().catch(() => ({}))) as typeof data
        } else {
          // Small files: one multipart POST. XHR (not fetch) so we get real
          // upload progress; when the body finishes uploading we flip to the
          // processing spinner while the server talks to Meta.
          const res = await new Promise<{ ok: boolean; status: number; data: typeof data }>((resolve, reject) => {
            const form = new FormData()
            form.append("file", file)
            const xhr = new XMLHttpRequest()
            xhr.open("POST", `/api/whatsapp/conversations/${detail.id}/media`)
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) onPct((e.loaded / e.total) * 100) }
            xhr.upload.onload = () => patch({ uploadPct: 100, uploadPhase: "processing" })
            xhr.onload = () => {
              let parsed: typeof data = {}
              try { parsed = JSON.parse(xhr.responseText) } catch {}
              resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data: parsed })
            }
            xhr.onerror = () => reject(new Error("Network error"))
            xhr.send(form)
          })
          ok = res.ok
          statusCode = res.status
          data = res.data
        }

        if (!ok) {
          setSendError(data.error || `HTTP ${statusCode}`)
          // Clear the overlay (uploadPhase undefined) so the bubble shows the
          // photo + the "Not delivered" line; keep the local blob visible.
          patch({ status: "failed", errorDetail: data.error ?? `HTTP ${statusCode}`, uploadPhase: undefined, uploadPct: undefined })
        } else if (data.message) {
          // Swap in the server row but CARRY the local blob so the on-screen
          // pixels don't blank while ChatMedia preloads the proxy. Overlay off.
          const serverMsg = { ...(data.message as MessageRow), localMediaUrl: localUrl, uploadPhase: undefined, uploadPct: undefined }
          localMediaCache.set(serverMsg.id, localUrl)
          localMediaCache.delete(tempId)
          setDetail((prev) =>
            prev ? { ...prev, messages: prev.messages.map((m) => (m.id === tempId ? serverMsg : m)) } : prev,
          )
          refreshList()
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setSendError(msg)
        patch({ status: "failed", errorDetail: msg, uploadPhase: undefined, uploadPct: undefined })
      }
    },
    [detail, refreshList],
  )

  const reassign = async (trainerId: string | null) => {
    if (!detail) return
    setAssignOpen(false)
    try {
      const r = await fetch(`/api/whatsapp/conversations/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTrainerId: trainerId }),
      })
      if (r.ok) {
        const d = await r.json()
        setDetail((prev) =>
          prev
            ? { ...prev, assignedTrainer: d.assignedTrainer, accessTrainers: d.accessTrainers ?? prev.accessTrainers }
            : prev
        )
        await refreshList()
      }
    } catch {}
  }

  // On-demand translation of a single client message into the studio's
  // configured inbox language. Updates the bubble in place on success.
  const translateMessage = async (messageId: string) => {
    setTranslatingIds((prev) => new Set(prev).add(messageId))
    try {
      const r = await fetch(`/api/whatsapp/messages/${messageId}/translate`, { method: "POST" })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setSendError(d?.message || "Couldn't translate the message.")
        return
      }
      // Already in the target language — nothing to show; tell the user briefly.
      if (d.alreadyInTarget && !d.translatedBody) {
        setSendError("Message is already in the target language.")
        setTimeout(() => setSendError(null), 2500)
      }
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === messageId
                  ? { ...m, translatedBody: d.translatedBody ?? m.translatedBody, detectedLang: d.detectedLang ?? m.detectedLang }
                  : m
              ),
            }
          : prev
      )
    } catch {
      setSendError("Network error — translation failed.")
    } finally {
      setTranslatingIds((prev) => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      })
    }
  }

  // React to a message with an emoji (or clear with ""). Optimistic — the
  // bubble updates instantly; the server persists + mirrors to the client.
  const reactMessage = async (messageId: string, emoji: string) => {
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === messageId ? { ...m, reaction: emoji || null } : m
            ),
          }
        : prev
    )
    try {
      await fetch(`/api/whatsapp/messages/${messageId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      })
    } catch {
      /* keep the optimistic value; a reload will reconcile */
    }
  }

  const windowOpen = useMemo(() => {
    if (!detail?.lastInboundAt) return false
    return Date.now() - new Date(detail.lastInboundAt).getTime() < ONE_DAY_MS
  }, [detail?.lastInboundAt])

  // ---------- List column ----------
  // Client-side search over the loaded conversation list (by name; admin can
  // also match by phone digits).
  const searchQ = search.trim().toLowerCase()
  const searchDigits = searchQ.replace(/\D/g, "")
  const visibleConvos = useMemo(() => {
    if (!convos) return convos
    let list = convos
    // Day filter: only clients booked today / tomorrow.
    if (dateFilter === "today") list = list.filter((c) => c.bookedToday)
    else if (dateFilter === "tomorrow") list = list.filter((c) => c.bookedTomorrow)
    // Clients whose latest message nobody replied to or reacted on yet.
    else if (dateFilter === "awaiting") list = list.filter((c) => c.awaitingReply)
    // Name / phone search.
    if (searchQ) {
      list = list.filter(
        (c) =>
          (c.clientName ?? "").toLowerCase().includes(searchQ) ||
          (role === "ADMIN" &&
            searchDigits.length > 0 &&
            c.clientPhone.replace(/\D/g, "").includes(searchDigits)),
      )
    }
    return list
  }, [convos, dateFilter, searchQ, searchDigits, role])

  const listColumn = (
    <div className="bg-white border-r border-gray-100 flex flex-col h-full dark:bg-[#0B141A] dark:border-transparent">
      {/* WhatsApp-style header: title left, action icons + close on the right. */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
        <h1 className="text-[26px] font-bold text-gray-900 dark:text-white truncate">
          Inbox
        </h1>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Font-size control: applies to bubble/list/composer text inside this Inbox only. */}
          <button
            onClick={() => setFontStepPersist(fontStep - 1)}
            disabled={fontStep <= 0}
            className="w-9 h-9 rounded-full hover:bg-gray-100 dark:hover:bg-[#2A3942] disabled:opacity-30 text-gray-600 dark:text-gray-300 flex items-center justify-center"
            aria-label="Smaller text"
          >
            <AArrowDown size={18} />
          </button>
          <button
            onClick={() => setFontStepPersist(fontStep + 1)}
            disabled={fontStep >= FONT_STEPS.length - 1}
            className="w-9 h-9 rounded-full hover:bg-gray-100 dark:hover:bg-[#2A3942] disabled:opacity-30 text-gray-600 dark:text-gray-300 flex items-center justify-center"
            aria-label="Larger text"
          >
            <AArrowUp size={18} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-[#2A3942] flex items-center justify-center text-gray-700 dark:text-gray-200 ml-1"
              aria-label="Close inbox"
              title="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Search by client name (or phone for admin). */}
      {convos && convos.length > 0 && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#8696A0]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени"
              className="w-full bg-gray-100 dark:bg-[#202C33] rounded-lg pl-9 pr-3 py-2 text-sm text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-[#8696A0] focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        </div>
      )}

      {/* Day filter: All / Today / Tomorrow — by the client's booking date. */}
      {convos && convos.length > 0 && (
        <div className="px-3 pb-2 flex-shrink-0 flex items-center gap-1.5 flex-wrap">
          {([
            { key: "all", label: "All chats", count: convos.length },
            { key: "today", label: "Today's class", count: convos.filter((c) => c.bookedToday).length },
            { key: "tomorrow", label: "Tomorrow's class", count: convos.filter((c) => c.bookedTomorrow).length },
            // Admin's control list: clients whose latest message has no staff
            // reply/reaction yet. The admin red number clears on view, so THIS
            // tab is where "nobody answered" lives now.
            ...(role === "ADMIN"
              ? ([{ key: "awaiting", label: "Awaiting reply", count: convos.filter((c) => c.awaitingReply).length }] as const)
              : []),
          ] as const).map((f) => {
            const active = dateFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setDateFilter(f.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors",
                  active
                    ? "bg-brand text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-[#202C33] dark:text-[#8696A0] dark:hover:bg-[#2A3942]",
                )}
              >
                {f.label}
                {f.key !== "all" && (
                  <span className={cn("ml-1", active ? "text-white/80" : "text-gray-400 dark:text-[#6B7C85]")}>
                    {f.count}
                  </span>
                )}
              </button>
            )
          })}
          {/* Clear the whole admin unread backlog at once (badge = unreadAdmin). */}
          {role === "ADMIN" && convos.some((c) => c.unread > 0) && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="ml-auto px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap text-brand hover:bg-brand/5 disabled:opacity-50"
            >
              {markingAll ? "…" : "Mark all read"}
            </button>
          )}
        </div>
      )}

      {/* Role-specific counter semantics (owner rule 06.07):
          admin numbers clear on view; trainer numbers clear only on a
          reply/reaction. One line each so a sticky badge never reads as a bug. */}
      {convos && convos.some((c) => c.unread > 0) && (
        <div className="px-4 pb-2 flex-shrink-0 text-[11px] leading-snug text-gray-400 dark:text-[#6B7C85]">
          {role === "ADMIN"
            ? "Red numbers = messages nobody has seen yet - opening a chat clears them. Clients still waiting for an answer live in the Awaiting reply tab."
            : "Red numbers = clients waiting for a reply. They clear when someone replies (or reacts) - not when you open the chat."}
        </div>
      )}

      {!convos ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          <Loader2 size={16} className="animate-spin mr-2" /> Loading...
        </div>
      ) : convos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm px-6 text-center">
          <MessageSquare size={32} className="mb-3 opacity-30" />
          <div>No conversations yet.</div>
          <div className="text-xs mt-1">
            {role === "ADMIN"
              ? "A chat appears when a client books or messages the number."
              : "A chat appears when a client books your class and replies to the confirmation."}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {visibleConvos!.length === 0 && (
            <div className="py-10 text-center text-gray-400 dark:text-[#8696A0] text-sm">Ничего не найдено</div>
          )}
          {visibleConvos!.map((c) => {
            const hasUnread = c.unread > 0
            return (
              <button
                key={c.id}
                onClick={() => openConvo(c.id)}
                className={cn(
                  "w-full text-left pl-4 pr-3 py-2.5 flex gap-3 items-center transition-colors",
                  "hover:bg-gray-50 dark:hover:bg-[#202C33]",
                  selectedId === c.id && "bg-gray-100 dark:bg-[#202C33]",
                )}
              >
                {/* Avatar — WhatsApp uses ~52px, default to a neutral gradient
                    if no profile photo is set. */}
                <div
                  className="w-[52px] h-[52px] rounded-full text-white flex items-center justify-center font-semibold text-xl flex-shrink-0 select-none"
                  style={avatarBg(c.clientName || c.clientPhone || "?")}
                >
                  {(c.clientName?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 border-b border-gray-100 dark:border-[#222D34] pb-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <div
                      className="font-medium text-gray-900 dark:text-white truncate"
                      style={{ fontSize: `${fontScale}rem` }}
                    >
                      {/* Trainers never see phone numbers — even when a
                          client has no name set, fall back to a neutral
                          label. Admin can still see the phone. */}
                      {c.clientName ||
                        (role === "TRAINER"
                          ? "Client"
                          : formatPhone(c.clientPhone))}
                    </div>
                    <div
                      className={cn(
                        "text-[12px] flex-shrink-0 tabular-nums",
                        hasUnread
                          ? "text-[#25D366] font-semibold"
                          : "text-gray-400 dark:text-[#8696A0]",
                      )}
                    >
                      {formatDistanceToNowStrict(new Date(c.lastMessageAt), { addSuffix: false })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div
                      className="truncate flex-1 flex items-center gap-1"
                      style={{ fontSize: `${fontScale * 0.8125}rem` }}
                    >
                      {c.bookingPreview ? (
                        <>
                          <Calendar size={12} className="text-violet-500 dark:text-violet-400 flex-shrink-0" />
                          <span className="truncate text-violet-600 dark:text-violet-400 font-medium">{c.bookingPreview}</span>
                        </>
                      ) : (
                        <>
                          {c.lastMessage?.direction === "OUTBOUND" && (
                            <CheckCheck size={14} className="text-gray-400 dark:text-[#8696A0] flex-shrink-0" />
                          )}
                          {/* Agent handled this chat last - staff sees it at a glance (owner 16.07). */}
                          {c.lastMessage?.direction === "OUTBOUND" && c.lastMessage?.fromAgent && (
                            <span className="flex-shrink-0 text-[11px]" title="Answered by the agent">🤖</span>
                          )}
                          <span className="truncate text-gray-500 dark:text-[#8696A0]">{previewText(c.lastMessage)}</span>
                        </>
                      )}
                    </div>
                    {/* How long the client has been waiting for an answer -
                        goes amber after 2h, red after 6h (audit 09.07: median
                        answer 2.6h, p90 12h - the wait was invisible). */}
                    {c.awaitingReply && c.lastInboundAt && (() => {
                      const h = (Date.now() - new Date(c.lastInboundAt).getTime()) / 3600_000
                      if (h < 1) return null
                      return (
                        <span className={cn(
                          "text-[11px] font-semibold tabular-nums flex-shrink-0 px-1.5 py-0.5 rounded-full",
                          h >= 6 ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
                        )}>
                          {Math.floor(h)}h
                        </span>
                      )
                    })()}
                    {/* Unread dot — shows 1 per conversation (same principle as app icon badge). */}
                    {hasUnread && (
                      <span className="bg-[#25D366] text-white text-[11px] w-5 h-5 rounded-full flex items-center justify-center font-semibold flex-shrink-0">
                        1
                      </span>
                    )}
                  </div>
                  {/* The client's class: their upcoming booking, or — if none —
                      the last class they had. Nothing for chat-only clients. */}
                  {c.lastClass && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 dark:text-[#8696A0]">
                      <Calendar size={11} className="flex-shrink-0 opacity-70" />
                      <span className="tabular-nums">
                        {format(new Date(c.lastClass.date + "T00:00:00"), "EEE, MMM d")} · {c.lastClass.startTime}
                      </span>
                    </div>
                  )}
                  {role === "ADMIN" && c.accessTrainers.length > 0 && (
                    // Multi-assign: every trainer who has access (= booked
                    // by this client) appears as a colored dot + name. Names
                    // wrap to a second line if there are many.
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {c.accessTrainers.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-[#8696A0]"
                          title={`Assigned to ${t.name}`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: t.color ?? "#6366F1" }}
                          />
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {role === "ADMIN" && c.accessTrainers.length === 0 && (
                    <div className="mt-1 text-[11px] text-gray-300 dark:text-[#5C6970] italic">
                      no trainer
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  // ---------- Chat column ----------
  const chatColumn = !selectedId ? (
    <div className="hidden lg:flex flex-1 items-center justify-center text-gray-400 dark:text-[#8696A0] text-sm bg-sand dark:bg-[#0B141A]">
      <div className="text-center">
        <MessageSquare size={48} className="mx-auto opacity-20 mb-3" />
        <div>Select a conversation on the left</div>
      </div>
    </div>
  ) : (
    // Flex-column layout: header pinned at top, messages take all remaining
    // height and scroll internally, composer+keyboard pinned at bottom.
    // We used to use a single scroll container with sticky header/composer,
    // but since we replaced iOS' native keyboard with VirtualKeyboard
    // (textarea has inputMode="none"), there's no longer a reason to fight
    // iOS keyboard scroll behavior — and sticky-bottom misbehaves when the
    // thread has only a few messages (composer drifts up to sit just below
    // the last message instead of being glued to the bottom of the chat).
    <div className="flex-1 min-w-0 h-full flex flex-col bg-[#ECE5DD] dark:bg-[#0B141A]">
      {/* Chat header — WhatsApp style: round back button, avatar + name,
          action icons on the right. */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-2 py-2 flex items-center gap-2 dark:bg-[#1F2C34] dark:border-transparent">
        <button
          onClick={closeConvo}
          className="lg:hidden w-9 h-9 rounded-full bg-gray-100 dark:bg-[#2A3942] flex items-center justify-center text-gray-700 dark:text-gray-200 flex-shrink-0"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div
          className="w-10 h-10 rounded-full text-white flex items-center justify-center font-semibold text-base flex-shrink-0 select-none"
          style={avatarBg(detail?.clientName || detail?.clientPhone || "?")}
        >
          {(detail?.clientName?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="font-medium text-gray-900 dark:text-white truncate"
            style={{ fontSize: `${fontScale}rem` }}
          >
            {detail?.clientName ||
              (role === "TRAINER" ? "Client" : formatPhone(detail?.clientPhone ?? ""))}
          </div>
          {/* Phone subtitle: admin only. Trainers never see client phones. */}
          {detail?.clientName && role === "ADMIN" && (
            <div
              className="text-gray-500 dark:text-[#8696A0] truncate"
              style={{ fontSize: `${fontScale * 0.75}rem` }}
            >
              {formatPhone(detail.clientPhone)}
            </div>
          )}
        </div>

        <div className="hidden md:block">
          <WindowBadge lastInboundAt={detail?.lastInboundAt ?? null} />
        </div>

        {role === "ADMIN" && (
          <div className="relative">
            <button
              onClick={() => setAssignOpen((v) => !v)}
              className="text-xs px-2.5 py-1.5 rounded-full border border-gray-200 dark:border-[#2A3942] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#2A3942] flex items-center gap-1.5"
            >
              <UserCircle2 size={14} />
              <span className="max-w-[80px] truncate">{detail?.assignedTrainer?.name ?? "Admin"}</span>
              <ChevronDown size={12} />
            </button>
            {assignOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] z-10">
                <button
                  onClick={() => reassign(null)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-500",
                    !detail?.assignedTrainer && "bg-gray-50 font-semibold",
                  )}
                >
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  Admin
                </button>
                {trainers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => reassign(t.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2",
                      detail?.assignedTrainer?.id === t.id && "bg-gray-50 font-semibold",
                    )}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: t.color ?? "#6366F1" }}
                    />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages — own flex child that scrolls independently. min-h-0 is
          essential so flex-1 can actually shrink below content size. The
          relative wrapper hosts the Telegram-style floating date pill. */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        {/* Floating date pill — fades in while scrolling, out when idle. */}
        {floatingDate && (
          <div className="pointer-events-none absolute top-2 inset-x-0 z-20 flex justify-center">
            <span
              className={cn(
                "px-3 py-1 rounded-full text-[11px] font-medium text-gray-700 dark:text-gray-100 bg-white/85 dark:bg-[#1F2C34]/90 backdrop-blur shadow-md transition-all duration-300",
                floatingVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
              )}
            >
              {floatingDate}
            </span>
          </div>
        )}
        <div
          ref={messagesScrollRef}
          onScroll={handleMessagesScroll}
          // The interactive keyboard drag (peel down on a thread drag, snap on
          // release) is wired via native touch listeners in an effect above, so
          // it can preventDefault the scroll while it owns the gesture.
          className="chat-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 py-4 space-y-2"
        >
          {loadingDetail && !detail ? (
            <div className="text-center text-gray-400 text-sm py-8">
              <Loader2 size={16} className="animate-spin inline mr-2" /> Loading...
            </div>
          ) : (
            <>
              {messageGroups.map((g) => (
                <div key={g.key} data-day-label={g.label} className="space-y-2">
                  <DateSeparator label={g.label} />
                  {g.messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      m={m}
                      role={role}
                      fontScale={fontScale}
                      onTranslate={translateMessage}
                      translating={translatingIds.has(m.id)}
                      onReact={reactMessage}
                      canReact={windowOpen && m.direction === "INBOUND"}
                      onCopied={() => setCopiedAt(Date.now())}
                      onImageClick={setLightboxSrc}
                      onRetry={retryMessage}
                    />
                  ))}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Full-screen image viewer with zoom + pan (portaled to body so the
          floating-inbox transform can't clip it; shows the whole image). */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {/* Composer + VirtualKeyboard always at the bottom of the chat column
          (flex-shrink-0). The VirtualKeyboard replaces the OS soft keyboard
          entirely (textarea has inputMode="none"), so the modal never has to
          resize and the composer stays glued to the bottom regardless of how
          many messages are above. */}
      <div
        className="flex-shrink-0"
        ref={kb.wrapRef}
        style={{
          // When the keyboard is hidden the composer drops to the very bottom,
          // so lift it above the device's bottom inset (Android nav bar / iOS
          // home indicator). When the keyboard is open, its own panel already
          // carries that inset, so we add none here.
          paddingBottom: kb.open ? undefined : "env(safe-area-inset-bottom)",
          transition: "padding-bottom 0.26s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* WhatsApp-style composer row: + on the left, pill input with the
            textarea, white circular Send button on the right. Sits over the
            chat doodle background, no separate border. */}
        {/* AI sales agent suggestion (suggest-mode, owner 15.07). SAFE ->
            ready draft with Send / Edit / Dismiss; BOOKING/ESCALATE -> a
            "needs a human" note for the trainer. The agent NEVER sends by
            itself - a person always presses Send. */}
        {detail?.suggestion && detail.suggestion.id !== hiddenSuggestionId && (
          <div className="mx-2 mb-1 rounded-xl border bg-white/95 dark:bg-[#1F2C34] shadow-sm border-gray-200 dark:border-white/10 px-3 py-2">
            {detail.suggestion.category === "SAFE" && detail.suggestion.draft ? (
              <>
                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
                  🤖 Agent suggests a reply
                </div>
                <div className="text-[13px] whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100 max-h-40 overflow-y-auto">
                  {detail.suggestion.draft}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { const sug = detail.suggestion!; void send(sug.draft!, sug.id) }}
                    className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-medium active:scale-95"
                  >
                    Send
                  </button>
                  <button
                    type="button"
                    onClick={() => editSuggestion(detail.suggestion!)}
                    className="px-3 py-1.5 rounded-full border border-gray-300 dark:border-white/20 text-xs text-gray-700 dark:text-gray-200 active:scale-95"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void dismissSuggestion(detail.suggestion!)}
                    className="ml-auto px-3 py-1.5 rounded-full text-xs text-gray-500 dark:text-gray-400 active:scale-95"
                  >
                    Dismiss
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mb-0.5">
                    🤖 Agent: needs your reply
                  </div>
                  <div className="text-[12px] text-gray-700 dark:text-gray-300 break-words">
                    {detail.suggestion.reason || (detail.suggestion.category === "BOOKING" ? "Booking / schedule question" : "Needs a human reply")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void dismissSuggestion(detail.suggestion!)}
                  className="px-2.5 py-1 rounded-full text-xs text-gray-500 dark:text-gray-400 active:scale-95"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        )}
        {/* Composer is always available. Admins: free text outside the 24h
            window auto-wraps in the admin_message template server-side.
            Trainers: the 👋 sends an approved greeting template to re-open a
            cold chat; once the client replies, free text works again. The
            `windowOpen` flag still drives the 👋 (a greeting only makes sense
            to re-open a closed window, but it's harmless when open). */}
        {windowOpen || role === "ADMIN" || role === "TRAINER" ? (
          <Composer onSend={send} onAttach={sendMedia} fontScale={fontScale} role={role} onSendTemplate={sendTemplate} clientName={detail?.clientName ?? null} onWave={sendWave} waveDisabled={waveDisabled} quickReplyDisabled={quickReplyDisabled} onQuickReplySent={onQuickReplySent} windowOpen={windowOpen} keyboardOpen={kb.open} onKeyboardOpenChange={kb.setOpen} onKbHeight={kb.onPanelHeight} onClassAction={classInfo?.studioSlug === "canggu" ? () => setClassSheetOpen(true) : undefined} prefill={composerPrefill} />
        ) : null}
        {classSheetOpen && (
          <ChatBookingSheet
            role={role}
            clientName={detail?.clientName ?? null}
            bookings={classInfo?.bookings ?? []}
            onClose={() => setClassSheetOpen(false)}
            onChanged={() => { void refreshClassInfo(); void refreshList() }}
          />
        )}
        {sendError && (
          <div className="px-3 pb-1 text-xs text-red-600 dark:text-red-400 bg-[#ECE5DD] dark:bg-[#0B141A]">
            {sendError}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div
      className={cn(
        "flex bg-white overflow-hidden dark:bg-[#0B141A]",
        embedded
          ? // Inside the FloatingInbox modal we fill the *fixed* parent
            // exactly, not the viewport. The modal itself sets its own
            // height (tracking visualViewport so iOS' keyboard doesn't
            // push the composer behind the URL bar).
            "absolute inset-0"
          : pageVv
            ? // Phone + keyboard open: pin the chat to the visual viewport so
              // nothing floats (see pageVv effect above).
              "fixed z-40"
            : // Inside the page <main> with its 16/32px padding — escape it
              // and fit to the available height below the top bar.
              "h-[calc(100dvh-72px)] lg:h-[calc(100dvh-64px)] -m-4 lg:-m-8",
      )}
      style={
        !embedded && pageVv
          ? { top: pageVv.y, left: pageVv.x, width: pageVv.w, height: pageVv.h }
          : undefined
      }
    >
      {/* WhatsApp-style "copied" toast — dark pill near the bottom that slides
          up, holds, then fades out. Remounts on each copy (key) to replay. */}
      {copiedAt > 0 && (
        <div
          key={copiedAt}
          className="animate-toast-pop pointer-events-none fixed left-1/2 bottom-28 z-[60] flex items-center gap-2 rounded-full bg-gray-900/90 dark:bg-black/80 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm"
        >
          <span aria-hidden>✓</span> Copied
        </div>
      )}

      {/* Desktop: side-by-side. Mobile: show list, or chat if selected.
          NOTE: use lg:block (not lg:flex) here — as a flex item the list
          column wouldn't shrink below its content's intrinsic width
          (min-width:auto), so the inner column overflowed past the fixed
          360/400px and the search bar/rows spilled over the chat pane. */}
      <div
        className={cn(
          "w-full lg:w-[360px] xl:w-[400px] flex-shrink-0 overflow-hidden",
          selectedId && "hidden lg:block",
        )}
      >
        {listColumn}
      </div>
      <div className={cn("flex-1 min-w-0", !selectedId && "hidden lg:flex")}>{chatColumn}</div>
    </div>
  )
}
