"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Composer from "@/app/_components/Composer"
import { format, formatDistanceToNowStrict } from "date-fns"
import {
  ArrowLeft,
  AArrowDown,
  AArrowUp,
  Check,
  CheckCheck,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
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
const REACTIONS = ["👍", "🔥", "🥰", "😌", "🤩", "😇", "🥳", "🤠", "🌞", "🤌"] as const

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

function previewText(m: ConversationListItem["lastMessage"]): string {
  if (!m) return ""
  if (m.type === "text" && m.body) return m.body
  if (m.type === "template" && m.body) return m.body
  if (m.type === "image") return "📷 Image" + (m.body ? `: ${m.body}` : "")
  if (m.type === "audio") return "🎤 Voice message"
  if (m.type === "video") return "🎬 Video"
  if (m.type === "document") return "📄 " + (m.body ?? "Document")
  if (m.type === "sticker") return "Стикер"
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
        Окно закрыто — только шаблон
      </span>
    )
  }
  const ms = ONE_DAY_MS - (Date.now() - new Date(lastInboundAt).getTime())
  if (ms <= 0) {
    return (
      <span className="text-xs px-2 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
        Окно закрыто — только шаблон
      </span>
    )
  }
  const hrs = Math.floor(ms / 3_600_000)
  const mins = Math.floor((ms % 3_600_000) / 60_000)
  return (
    <span className="text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
      Окно открыто • {hrs}ч {mins}м
    </span>
  )
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
}: {
  m: MessageRow
  role: "ADMIN" | "TRAINER"
  fontScale: number
  onTranslate?: (messageId: string) => void
  translating?: boolean
  onReact?: (messageId: string, emoji: string) => void
  onDelete?: (messageId: string) => void
}) {
  const isOut = m.direction === "OUTBOUND"
  // WhatsApp-style action menu: long-press (touch) or right-click (desktop).
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openMenu = () => setMenuOpen(true)
  const startPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => setMenuOpen(true), 450)
  }
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const copyText = async () => {
    const text = m.body ?? m.translatedBody ?? ""
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard blocked — no-op */
    }
    setMenuOpen(false)
  }

  const react = (emoji: string) => {
    // Tapping the current reaction again clears it (toggle), like WhatsApp.
    onReact?.(m.id, m.reaction === emoji ? "" : emoji)
    setMenuOpen(false)
  }
  // Display text: prefer the translation if the server produced one. For
  // inbound that's the admin-language rendering; for outbound it's
  // (somewhat redundantly) what we actually sent to the client. The
  // original body is always shown as a smaller line below.
  const hasTranslation =
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex flex-col items-stretch gap-2 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            {/* Reaction bar */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-full bg-white dark:bg-[#233138] shadow-xl px-2 py-2">
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => react(e)}
                  className={cn(
                    "flex-shrink-0 text-2xl leading-none w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10",
                    m.reaction === e && "bg-gray-100 dark:bg-white/10",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* Menu — Copy only (WhatsApp Cloud API has no recall, so there's
                no real Delete to offer). */}
            <div className="rounded-2xl bg-white dark:bg-[#233138] shadow-xl overflow-hidden">
              <button
                type="button"
                onClick={copyText}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5"
              >
                {copied ? "Copied ✓" : "Copy"}
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
        onTouchMove={cancelPress}
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
        {/* Reaction badge — small pill hanging off the bottom of the bubble. */}
        {m.reaction && (
          <div
            className={cn(
              "absolute -bottom-3 flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-[#233138] shadow border border-gray-100 dark:border-white/10 text-sm",
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
                className="rounded-xl max-w-full max-h-72 object-cover mb-1 bg-black/10"
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
            {primaryText}
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
            {m.body}
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
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#2C6E49] hover:underline disabled:opacity-50"
            >
              🌐 {translating ? "Перевод…" : "Перевести"}
            </button>
          )}

        {m.errorDetail && (
          <div className="text-[10px] text-red-600 mt-1">Error: {m.errorDetail}</div>
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

export default function Inbox({
  role,
  embedded = false,
  onClose,
}: {
  role: "ADMIN" | "TRAINER"
  /** When true, the Inbox tracks its own selection in component state and
   *  doesn't write to the URL. Use this when the Inbox lives inside a modal
   *  that may be closed/reopened independently of navigation. */
  embedded?: boolean
  /** Optional close handler. When provided, an X button is rendered in the
   *  list-column header (only meaningful in embedded mode). */
  onClose?: () => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [embeddedSelectedId, setEmbeddedSelectedId] = useState<string | null>(null)
  const selectedId = embedded ? embeddedSelectedId : searchParams.get("c")

  const [convos, setConvos] = useState<ConversationListItem[] | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [sendError, setSendError] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)

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
    const t = setInterval(refreshList, 15_000)
    return () => clearInterval(t)
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
    const t = setInterval(() => refreshDetail(selectedId), 8_000)
    return () => clearInterval(t)
  }, [selectedId, refreshDetail])

  // Auto-scroll to bottom when messages change. Use the container's
  // scrollTop directly (not scrollIntoView) so we don't accidentally
  // smooth-scroll the underlying page on iOS Safari.
  useEffect(() => {
    const el = messagesScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [detail?.messages.length])

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

  // Send a photo/video. Optimistic bubble uses a local objectURL so the
  // image shows up instantly while the server uploads to Meta and dispatches
  // the message.
  const sendMedia = useCallback(
    async (file: File) => {
      if (!detail) return
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const localUrl = URL.createObjectURL(file)
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
        const form = new FormData()
        form.append("file", file)
        const r = await fetch(`/api/whatsapp/conversations/${detail.id}/media`, {
          method: "POST",
          body: form,
        })
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
        setSendError(d?.message || "Не удалось перевести сообщение.")
        return
      }
      // Already in the target language — nothing to show; tell the user briefly.
      if (d.alreadyInTarget && !d.translatedBody) {
        setSendError("Сообщение уже на нужном языке.")
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
      setSendError("Сеть недоступна — перевод не удался.")
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

      {!convos ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          <Loader2 size={16} className="animate-spin mr-2" /> Loading...
        </div>
      ) : convos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm px-6 text-center">
          <MessageSquare size={32} className="mb-3 opacity-30" />
          <div>Пока нет переписок.</div>
          <div className="text-xs mt-1">
            {role === "ADMIN"
              ? "Чат появится когда клиент сделает бронь или напишет на номер."
              : "Чат появится когда клиент забронит твой урок и ответит на подтверждение."}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {convos.map((c) => {
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
                <div className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#3B4A54] to-[#54656F] text-white flex items-center justify-center font-semibold text-xl flex-shrink-0 select-none">
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
                          ? "Клиент"
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
                      className="text-gray-500 dark:text-[#8696A0] truncate flex-1 flex items-center gap-1"
                      style={{ fontSize: `${fontScale * 0.8125}rem` }}
                    >
                      {c.lastMessage?.direction === "OUTBOUND" && (
                        <CheckCheck size={14} className="text-gray-400 dark:text-[#8696A0] flex-shrink-0" />
                      )}
                      <span className="truncate">{previewText(c.lastMessage)}</span>
                    </div>
                    {/* WhatsApp-style green unread badge on the right */}
                    {hasUnread && (
                      <span className="bg-[#25D366] text-white text-[11px] min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center font-semibold tabular-nums flex-shrink-0">
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </div>
                  {role === "ADMIN" && c.accessTrainers.length > 0 && (
                    // Multi-assign: every trainer who has access (= booked
                    // by this client) appears as a colored dot + name. Names
                    // wrap to a second line if there are many.
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {c.accessTrainers.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-[#8696A0]"
                          title={`Закреплён за ${t.name}`}
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
                      без тренера
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
    <div className="hidden lg:flex flex-1 items-center justify-center text-gray-400 text-sm bg-[#F5F4F0]">
      <div className="text-center">
        <MessageSquare size={48} className="mx-auto opacity-20 mb-3" />
        <div>Выбери переписку слева</div>
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
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3B4A54] to-[#54656F] text-white flex items-center justify-center font-semibold text-base flex-shrink-0 select-none">
          {(detail?.clientName?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="font-medium text-gray-900 dark:text-white truncate"
            style={{ fontSize: `${fontScale}rem` }}
          >
            {detail?.clientName ||
              (role === "TRAINER" ? "Клиент" : formatPhone(detail?.clientPhone ?? ""))}
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
              <span className="max-w-[80px] truncate">{detail?.assignedTrainer?.name ?? "Назначить"}</span>
              <ChevronDown size={12} />
            </button>
            {assignOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] z-10">
                <button
                  onClick={() => reassign(null)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                >
                  — Без тренера —
                </button>
                {trainers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => reassign(t.id)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
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
          essential so flex-1 can actually shrink below content size. */}
      <div
        ref={messagesScrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-4 space-y-2"
      >
        {loadingDetail && !detail ? (
          <div className="text-center text-gray-400 text-sm py-8">
            <Loader2 size={16} className="animate-spin inline mr-2" /> Loading...
          </div>
        ) : (
          <>
            {detail?.messages.map((m) => (
              <MessageBubble
                key={m.id}
                m={m}
                role={role}
                fontScale={fontScale}
                onTranslate={translateMessage}
                translating={translatingIds.has(m.id)}
                onReact={reactMessage}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Composer + VirtualKeyboard always at the bottom of the chat column
          (flex-shrink-0). The VirtualKeyboard replaces the OS soft keyboard
          entirely (textarea has inputMode="none"), so the modal never has to
          resize and the composer stays glued to the bottom regardless of how
          many messages are above. */}
      <div className="flex-shrink-0">
        {/* WhatsApp-style composer row: + on the left, pill input with the
            textarea, white circular Send button on the right. Sits over the
            chat doodle background, no separate border. */}
        {windowOpen || role === "ADMIN" ? (
          // Composer always available for admins — server auto-wraps text in
          // the admin_message template when the 24h window is closed, so we
          // never need to block typing in the UI. Trainers still get the
          // amber notice when the window is closed (they shouldn't be
          // re-starting cold conversations).
          <Composer onSend={send} onAttach={sendMedia} fontScale={fontScale} role={role} />
        ) : (
          <div className="px-2 pt-2 pb-2 bg-[#ECE5DD] dark:bg-[#0B141A]">
            <div className="mx-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2 dark:text-amber-200 dark:bg-amber-900/30 dark:border-amber-800">
              <Sparkles size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                24-часовое окно закрыто. Клиент должен написать первым, либо
                попроси администратора написать ему.
              </span>
            </div>
          </div>
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
          : // Inside the page <main> with its 16/32px padding — escape it
            // and fit to the available height below the top bar.
            "h-[calc(100dvh-72px)] lg:h-[calc(100dvh-64px)] -m-4 lg:-m-8",
      )}
    >
      {/* Desktop: side-by-side. Mobile: show list, or chat if selected */}
      <div
        className={cn(
          "w-full lg:w-[360px] xl:w-[400px] flex-shrink-0",
          selectedId && "hidden lg:flex",
        )}
      >
        {listColumn}
      </div>
      <div className={cn("flex-1 min-w-0", !selectedId && "hidden lg:flex")}>{chatColumn}</div>
    </div>
  )
}
