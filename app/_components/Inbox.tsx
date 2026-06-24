"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { upload } from "@vercel/blob/client"
import Composer from "@/app/_components/Composer"
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
  bookingPreview: string | null
  lastMessage: {
    id: string
    direction: "INBOUND" | "OUTBOUND"
    type: string
    body: string | null
    createdAt: string
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
  /** Emoji reaction the team put on this message (WhatsApp-style). */
  reaction: string | null
  fromTrainerId: string | null
  fromTrainer: { id: string; name: string } | null
  importedAt: string | null
  createdAt: string
}

// Emoji the team can react with (long-press a message).
const REACTIONS = ["❤️", "👍", "🔥", "🥰", "😌", "🤩", "😇", "🥳", "🤠", "🌞", "🤌"] as const

type ConversationDetail = {
  id: string
  clientPhone: string
  clientName: string | null
  assignedTrainer: Trainer | null
  accessTrainers: Trainer[]
  lastInboundAt: string | null
  lastMessageAt: string
  messages: MessageRow[]
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
          // WhatsApp bubble colors — light theme + dark theme via prefers-color-scheme
          isOut
            ? "bg-[#DCF8C6] text-gray-900 dark:bg-[#005C4B] dark:text-white"
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

        {/* Inline media. For pending optimistic messages we use the local
            objectURL stored in mediaUrl; for persisted ones we go through
            our /api/whatsapp/media proxy (which resolves the Meta media_id
            on demand). */}
        {m.type === "image" && (
          (() => {
            const src = m.mediaUrl?.startsWith("blob:")
              ? m.mediaUrl
              : `/api/whatsapp/media/${m.id}`
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={m.body ?? "photo"}
                draggable={false}
                onClick={(e) => { e.stopPropagation(); onImageClick?.(src) }}
                onTouchStart={onImgTouchStart}
                onTouchEnd={(e) => onImgTouchEnd(e, src)}
                className="rounded-xl max-w-full max-h-72 object-cover mb-1 bg-black/10 cursor-zoom-in"
                style={{ WebkitTouchCallout: "none" }}
              />
            )
          })()
        )}
        {m.type === "video" && (
          (() => {
            const src = m.mediaUrl?.startsWith("blob:")
              ? m.mediaUrl
              : `/api/whatsapp/media/${m.id}`
            return (
              <video
                src={src}
                controls
                playsInline
                className="rounded-xl max-w-full max-h-72 mb-1 bg-black"
              />
            )
          })()
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
        {m.fromTrainer && isOut && (
          <div className="text-[10px] text-gray-500 mt-1 italic">— {m.fromTrainer.name}</div>
        )}
        {!m.fromTrainer && isOut && m.type === "text" && (
          <div className="text-[10px] text-gray-500 mt-1 italic">— Admin</div>
        )}

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
        const keyboardOpen = visual.height < window.innerHeight - 80
        setPageVv(keyboardOpen ? { x: visual.offsetLeft, y: visual.offsetTop, w: visual.width, h: visual.height } : null)
        if (keyboardOpen) window.scrollTo(0, 0)
      })
    }
    update()
    visual.addEventListener("resize", update)
    return () => {
      cancelAnimationFrame(raf)
      visual.removeEventListener("resize", update)
    }
  }, [embedded, selectedId])

  const [convos, setConvos] = useState<ConversationListItem[] | null>(null)
  const [search, setSearch] = useState("")
  // Chat-list filter by booking day: all chats / booked today / booked tomorrow.
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "tomorrow">("all")
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [sendError, setSendError] = useState<string | null>(null)
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
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
      if (r.ok) setConvos(await r.json())
    } catch {}
  }, [])
  useEffect(() => {
    refreshList()
    // Visible-tab only (CPU guard 2026-06-12) — cabinets stay open 24/7.
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      refreshList()
    }
    const t = setInterval(tick, 30_000)
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
        const d = await r.json()
        setDetail(d)
      } else if (r.status === 403 || r.status === 404) {
        setDetail(null)
      }
    } catch {}
  }, [])
  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    setLoadingDetail(true)
    refreshDetail(selectedId).finally(() => setLoadingDetail(false))
    // Visible-tab only (CPU guard 2026-06-12): a chat left open in a
    // background tab used to hit the function every 8s all night.
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      refreshDetail(selectedId)
    }
    const t = setInterval(tick, 10_000)
    const onVis = () => { if (document.visibilityState === "visible") refreshDetail(selectedId) }
    document.addEventListener("visibilitychange", onVis)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis) }
  }, [selectedId, refreshDetail])

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

  const send = useCallback(async (draft: string) => {
    if (!detail || !draft.trim()) return
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
      importedAt: null,
      createdAt: new Date().toISOString(),
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
        body: JSON.stringify({ text: draft }),
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
      const WA_LIMIT_MB: Record<string, number> = { image: 5, video: 16, audio: 16, document: 100, sticker: 0.5 }
      const limitMb = WA_LIMIT_MB[guessType] ?? 16
      if (file.size > limitMb * 1024 * 1024) {
        const niceType = guessType === "sticker" ? "sticker" : guessType
        setSendError(`This ${niceType} is ${(file.size / 1024 / 1024).toFixed(0)}MB - WhatsApp allows up to ${limitMb}MB. Trim or compress it and try again.`)
        return
      }
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const localUrl = URL.createObjectURL(file)
      const optimistic: MessageRow = {
        id: tempId,
        direction: "OUTBOUND",
        type: guessType,
        body: null,
        translatedBody: null,
        detectedLang: null,
        mediaUrl: localUrl, // local objectURL for instant preview
        mediaMime: file.type,
        templateName: null,
        status: "queued",
        errorDetail: null,
        reaction: null,
        fromTrainerId: null,
        fromTrainer: null,
        importedAt: null,
        createdAt: new Date().toISOString(),
      }
      setDetail((prev) =>
        prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev,
      )
      setSendError(null)
      requestAnimationFrame(() => {
        const el = messagesScrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })

      try {
        // Vercel serverless caps the request body at ~4.5 MB, which a phone
        // video blows past. For anything sizeable, stream it straight to Vercel
        // Blob first and hand the media route just the URL; small photos still
        // take the simple multipart path.
        const BLOB_THRESHOLD = 4 * 1024 * 1024
        let r: Response
        if (file.size > BLOB_THRESHOLD) {
          const blob = await upload(file.name || "upload", file, {
            access: "public",
            handleUploadUrl: `/api/whatsapp/conversations/${detail.id}/blob-upload`,
            contentType: file.type || undefined,
          })
          r = await fetch(`/api/whatsapp/conversations/${detail.id}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blobUrl: blob.url, mime: file.type, filename: file.name }),
          })
        } else {
          const form = new FormData()
          form.append("file", file)
          r = await fetch(`/api/whatsapp/conversations/${detail.id}/media`, {
            method: "POST",
            body: form,
          })
        }
        const data = (await r.json().catch(() => ({}))) as {
          message?: MessageRow
          error?: string
        }
        if (!r.ok) {
          setSendError(data.error || `HTTP ${r.status}`)
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
        } else if (data.message) {
          // Replace the optimistic bubble with the server row; revoke the
          // local objectURL since the bubble now points to the proxy.
          URL.revokeObjectURL(localUrl)
          setDetail((prev) =>
            prev
              ? {
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === tempId ? (data.message as MessageRow) : m,
                  ),
                }
              : prev,
          )
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
        <div className="px-3 pb-2 flex-shrink-0 flex items-center gap-1.5">
          {([
            { key: "all", label: "All chats", count: convos.length },
            { key: "today", label: "Today's class", count: convos.filter((c) => c.bookedToday).length },
            { key: "tomorrow", label: "Tomorrow's class", count: convos.filter((c) => c.bookedTomorrow).length },
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
        <div className="flex-1 overflow-y-auto">
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
                          <span className="truncate text-gray-500 dark:text-[#8696A0]">{previewText(c.lastMessage)}</span>
                        </>
                      )}
                    </div>
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
          className="chat-scroll flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-4 space-y-2"
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
      <div className="flex-shrink-0">
        {/* WhatsApp-style composer row: + on the left, pill input with the
            textarea, white circular Send button on the right. Sits over the
            chat doodle background, no separate border. */}
        {/* Composer is always available. Admins: free text outside the 24h
            window auto-wraps in the admin_message template server-side.
            Trainers: the 👋 sends an approved greeting template to re-open a
            cold chat; once the client replies, free text works again. The
            `windowOpen` flag still drives the 👋 (a greeting only makes sense
            to re-open a closed window, but it's harmless when open). */}
        {windowOpen || role === "ADMIN" || role === "TRAINER" ? (
          <Composer onSend={send} onAttach={sendMedia} fontScale={fontScale} role={role} onSendTemplate={sendTemplate} clientName={detail?.clientName ?? null} onWave={sendWave} waveDisabled={waveDisabled} windowOpen={windowOpen} />
        ) : null}
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
