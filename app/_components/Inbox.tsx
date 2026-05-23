"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useRouter, useSearchParams } from "next/navigation"
import VirtualKeyboard from "@/app/_components/VirtualKeyboard"
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
  mediaUrl: string | null
  mediaMime: string | null
  templateName: string | null
  status: string
  errorDetail: string | null
  fromTrainerId: string | null
  fromTrainer: { id: string; name: string } | null
  importedAt: string | null
  createdAt: string
}

type ConversationDetail = {
  id: string
  clientPhone: string
  clientName: string | null
  assignedTrainer: Trainer | null
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
  if (m.type === "sticker") return "💟 Sticker"
  return m.body ?? `[${m.type}]`
}

function StatusTick({ status }: { status: string }) {
  if (status === "read") return <CheckCheck size={14} className="text-blue-500" />
  if (status === "delivered") return <CheckCheck size={14} className="text-gray-400" />
  if (status === "sent") return <Check size={14} className="text-gray-400" />
  if (status === "failed") return <span className="text-[10px] text-red-500">!</span>
  return <Loader2 size={12} className="text-gray-300 animate-spin" />
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

function MessageBubble({
  m,
  role,
  fontScale,
}: {
  m: MessageRow
  role: "ADMIN" | "TRAINER"
  fontScale: number
}) {
  const isOut = m.direction === "OUTBOUND"
  return (
    <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 leading-snug shadow-sm",
          // WhatsApp bubble colors — light theme + dark theme via prefers-color-scheme
          isOut
            ? "bg-[#DCF8C6] text-gray-900 dark:bg-[#005C4B] dark:text-white"
            : "bg-white text-gray-900 border border-gray-100 dark:bg-[#1F2C34] dark:text-white dark:border-transparent",
          m.importedAt && "opacity-80",
        )}
        style={{ fontSize: `${fontScale * 0.875}rem` }}
      >
        {m.type === "template" && (
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-medium mb-1 flex items-center gap-1">
            <Sparkles size={11} /> {m.templateName ?? "Template"}
          </div>
        )}
        {m.type === "image" && (
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <ImageIcon size={12} /> Image (open in WhatsApp)
          </div>
        )}
        {m.type === "audio" && <div className="text-xs text-gray-500 mb-1">🎤 Voice message</div>}
        {m.type === "document" && (
          <div className="text-xs text-gray-500 mb-1">📄 {m.body ?? "document"}</div>
        )}

        {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}

        {m.fromTrainer && isOut && (
          <div className="text-[10px] text-gray-500 mt-1 italic">— {m.fromTrainer.name}</div>
        )}
        {!m.fromTrainer && isOut && role === "ADMIN" && m.type === "text" && (
          <div className="text-[10px] text-gray-500 mt-1 italic">— Admin</div>
        )}

        {m.errorDetail && (
          <div className="text-[10px] text-red-600 mt-1">Error: {m.errorDetail}</div>
        )}

        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[10px] text-gray-500">{format(new Date(m.createdAt), "HH:mm")}</span>
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
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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

  // Keep the caret blinking in the textarea any time a chat is open, even
  // if the user taps somewhere else in the modal. Without this the caret
  // disappears as soon as the textarea loses focus, which makes it look
  // like typing won't work (although our VirtualKeyboard still drives it).
  // Because the textarea has inputMode="none", refocusing it does NOT
  // pop the OS soft keyboard.
  useEffect(() => {
    if (!selectedId) return
    const t = textareaRef.current
    if (!t) return
    t.focus()
  }, [selectedId])

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

  const send = async () => {
    if (!detail || !text.trim() || sending) return
    const draft = text.trim()
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
      mediaUrl: null,
      mediaMime: null,
      templateName: null,
      status: "queued",
      errorDetail: null,
      fromTrainerId: null,
      fromTrainer: null,
      importedAt: null,
      createdAt: new Date().toISOString(),
    }
    // flushSync forces the optimistic bubble + cleared text to commit to
    // the DOM in the same synchronous task as our re-focus call below. If
    // we let React batch these updates, iOS Safari sees the textarea's
    // value change (via re-render) AFTER the click handler finishes and
    // dismisses the keyboard. Keeping it synchronous lets us re-focus
    // immediately while iOS still considers the textarea active.
    flushSync(() => {
      setDetail((prev) =>
        prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : prev,
      )
      setText("")
      setSendError(null)
    })
    textareaRef.current?.focus()
    // Scroll to the bottom so the new bubble is visible. Direct scrollTop
    // assignment avoids triggering iOS Safari's "scroll the page" path
    // that scrollIntoView can take.
    requestAnimationFrame(() => {
      const el = messagesScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })

    setSending(true)
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
    } finally {
      setSending(false)
    }
  }

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
        setDetail((prev) => (prev ? { ...prev, assignedTrainer: d.assignedTrainer } : prev))
        await refreshList()
      }
    } catch {}
  }

  const windowOpen = useMemo(() => {
    if (!detail?.lastInboundAt) return false
    return Date.now() - new Date(detail.lastInboundAt).getTime() < ONE_DAY_MS
  }, [detail?.lastInboundAt])

  // ---------- List column ----------
  const listColumn = (
    <div className="bg-white border-r border-gray-100 flex flex-col h-full dark:bg-[#111B21] dark:border-[#2A3942]">
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-800 flex items-center gap-2 dark:text-white">
            <MessageSquare size={18} className="text-[#2C6E49]" />
            Inbox
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {role === "ADMIN" ? "Все переписки студии" : "Переписки с твоими клиентами"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Font-size control: applies to bubble/list/composer text inside this Inbox only. */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setFontStepPersist(fontStep - 1)}
              disabled={fontStep <= 0}
              className="p-1.5 rounded-md hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent text-gray-600"
              aria-label="Smaller text"
              title="Smaller"
            >
              <AArrowDown size={16} />
            </button>
            <div className="text-[10px] text-gray-400 font-mono w-8 text-center select-none">
              {Math.round(fontScale * 100)}%
            </div>
            <button
              onClick={() => setFontStepPersist(fontStep + 1)}
              disabled={fontStep >= FONT_STEPS.length - 1}
              className="p-1.5 rounded-md hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent text-gray-600"
              aria-label="Larger text"
              title="Larger"
            >
              <AArrowUp size={16} />
            </button>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
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
          {convos.map((c) => (
            <button
              key={c.id}
              onClick={() => openConvo(c.id)}
              className={cn(
                "w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-3",
                selectedId === c.id && "bg-[#F0F7F2]",
              )}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2C6E49] to-[#43A06B] text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
                {(c.clientName?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="font-medium text-gray-800 truncate dark:text-white"
                    style={{ fontSize: `${fontScale * 0.875}rem` }}
                  >
                    {c.clientName || formatPhone(c.clientPhone)}
                  </div>
                  <div className="text-[10px] text-gray-400 flex-shrink-0">
                    {formatDistanceToNowStrict(new Date(c.lastMessageAt), { addSuffix: false })}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div
                    className="text-gray-500 truncate flex-1"
                    style={{ fontSize: `${fontScale * 0.75}rem` }}
                  >
                    {c.lastMessage?.direction === "OUTBOUND" && (
                      <span className="text-gray-400">Вы: </span>
                    )}
                    {previewText(c.lastMessage)}
                  </div>
                  {c.unread > 0 && (
                    <span className="bg-[#2C6E49] text-white text-[10px] min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center font-semibold">
                      {c.unread}
                    </span>
                  )}
                </div>
                {role === "ADMIN" && (
                  <div className="mt-1">
                    {c.assignedTrainer ? (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                        style={{
                          backgroundColor: (c.assignedTrainer.color ?? "#6366F1") + "20",
                          color: c.assignedTrainer.color ?? "#6366F1",
                        }}
                      >
                        {c.assignedTrainer.name}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-gray-100 text-gray-500">
                        Не назначен
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          ))}
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
    <div
      ref={messagesScrollRef}
      onTouchMove={() => {
        if (document.activeElement === textareaRef.current) {
          textareaRef.current?.blur()
        }
      }}
      className="flex-1 min-w-0 h-full overflow-y-auto bg-[#ECE5DD] dark:bg-[#0B141A]"
    >
      {/* Single-scroll-container pattern (mirrors WhatsApp/Telegram web):
          the chatColumn itself is the scroll container, the header sticks
          to its top and the composer sticks to its bottom. When iOS Safari
          auto-scrolls the focused textarea into view, it scrolls *this*
          container — the sticky elements naturally remain glued to the top
          and bottom of the visible area, so the header no longer flies off
          and the composer stays pinned above the keyboard. */}
      {/* Chat header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 dark:bg-[#1F2C34] dark:border-transparent">
        <button
          onClick={closeConvo}
          className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2C6E49] to-[#43A06B] text-white flex items-center justify-center font-semibold text-sm">
          {(detail?.clientName?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="font-medium text-gray-800 truncate dark:text-white"
            style={{ fontSize: `${fontScale}rem` }}
          >
            {detail?.clientName || formatPhone(detail?.clientPhone ?? "")}
          </div>
          <div
            className="text-gray-500 truncate"
            style={{ fontSize: `${fontScale * 0.75}rem` }}
          >
            {formatPhone(detail?.clientPhone ?? "")}
          </div>
        </div>

        <div className="hidden sm:block">
          <WindowBadge lastInboundAt={detail?.lastInboundAt ?? null} />
        </div>

        {role === "ADMIN" && (
          <div className="relative">
            <button
              onClick={() => setAssignOpen((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5"
            >
              <UserCircle2 size={14} />
              {detail?.assignedTrainer?.name ?? "Назначить"}
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

      {/* Messages — now direct children of the scroll container itself,
          so iOS Safari has exactly one scrollable element to work with. */}
      <div className="px-3 sm:px-6 py-4 space-y-2">
        {loadingDetail && !detail ? (
          <div className="text-center text-gray-400 text-sm py-8">
            <Loader2 size={16} className="animate-spin inline mr-2" /> Loading...
          </div>
        ) : (
          <>
            {detail?.messages.map((m) => (
              <MessageBubble key={m.id} m={m} role={role} fontScale={fontScale} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Composer + VirtualKeyboard pinned together to the bottom of the
          scroll container. The VirtualKeyboard replaces the OS soft
          keyboard entirely (textarea has inputMode="none"), so the modal
          never has to resize for it — both rows stay at the bottom of the
          visible area as the user scrolls older messages. */}
      <div className="sticky bottom-0 z-20 bg-white border-t border-gray-100 dark:bg-[#1F2C34] dark:border-transparent">
        <div
          className="px-3 sm:px-4 pt-3"
          style={{ paddingBottom: 8 }}
        >
        {!windowOpen && (
          <div className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <Sparkles size={14} />
            <span>
              24-часовое окно закрыто. Клиент должен написать первым, либо отправь утверждённый
              шаблон (в этой версии — через бронирование). Free-form text заблокирован.
            </span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              // Keep the caret visible — refocus on the next frame unless
              // focus was deliberately handed off to another control
              // (e.g. the assign-trainer dropdown). We only refocus when
              // nothing else grabbed focus.
              requestAnimationFrame(() => {
                const active = document.activeElement
                if (
                  textareaRef.current &&
                  (active === document.body || active === null)
                ) {
                  textareaRef.current.focus({ preventScroll: true })
                }
              })
            }}
            // inputMode="none" tells iOS Safari / Chrome Android to NOT pop
            // the OS soft keyboard when this textarea is focused. The
            // VirtualKeyboard below handles all input. We still leave the
            // textarea editable so users on desktops with hardware keyboards
            // can type normally.
            inputMode="none"
            // Hide autocorrect/autocomplete chrome since we drive input ourselves.
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={windowOpen ? "Напиши сообщение..." : "Окно закрыто — нужен шаблон"}
            disabled={!windowOpen || sending}
            rows={1}
            className="flex-1 resize-none border border-gray-200 rounded-2xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] disabled:bg-gray-50 disabled:text-gray-400 max-h-32 dark:bg-[#2A3942] dark:border-transparent dark:text-white dark:placeholder-gray-400 dark:disabled:bg-[#1F2C34]"
            style={{ minHeight: 40, fontSize: `${fontScale * 0.875}rem` }}
          />
          <button
            onClick={send}
            // tabIndex=-1 + preventDefault on mousedown keep the textarea
            // focused (and therefore the keyboard up) when the user taps
            // Send. Without these iOS moves focus to the button, dismisses
            // the keyboard, and the user has to re-tap the textarea to
            // continue typing. `onPointerDown` is the modern equivalent
            // that also covers touch-only interaction without blocking
            // the synthetic click that iOS still needs to fire.
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            disabled={!windowOpen || sending || !text.trim()}
            className="bg-[#2C6E49] hover:bg-[#1E4D34] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl px-4 py-2.5 text-sm font-medium flex items-center gap-1.5 transition-colors flex-shrink-0"
            aria-label="Send"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
        {sendError && <div className="mt-2 text-xs text-red-600">{sendError}</div>}
        </div>
        {/* In-page keyboard. Replaces the OS soft keyboard entirely — see
            the textarea's `inputMode="none"`. The keyboard never sends —
            the green Send button in the composer above does that. */}
        <VirtualKeyboard
          onInsert={(ch) => setText((t) => t + ch)}
          onBackspace={() => setText((t) => t.slice(0, -1))}
        />
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
