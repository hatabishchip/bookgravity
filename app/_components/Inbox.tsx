"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format, formatDistanceToNowStrict } from "date-fns"
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  UserCircle2,
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

function MessageBubble({ m, role }: { m: MessageRow; role: "ADMIN" | "TRAINER" }) {
  const isOut = m.direction === "OUTBOUND"
  return (
    <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm",
          isOut ? "bg-[#DCF8C6] text-gray-900" : "bg-white text-gray-900 border border-gray-100",
          m.importedAt && "opacity-80",
        )}
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

export default function Inbox({ role }: { role: "ADMIN" | "TRAINER" }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get("c")

  const [convos, setConvos] = useState<ConversationListItem[] | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [detail?.messages.length])

  const openConvo = (id: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("c", id)
    router.push(`?${params.toString()}`)
  }
  const closeConvo = () => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.delete("c")
    router.push(params.toString() ? `?${params.toString()}` : "?")
  }

  const send = async () => {
    if (!detail || !text.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      const r = await fetch(`/api/whatsapp/conversations/${detail.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      })
      const data = await r.json()
      if (!r.ok) {
        setSendError(data.error || `HTTP ${r.status}`)
      } else {
        setText("")
        await refreshDetail(detail.id)
        await refreshList()
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e))
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
    <div className="bg-white border-r border-gray-100 flex flex-col h-full">
      <div className="px-5 py-4 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <MessageSquare size={18} className="text-[#2C6E49]" />
          Inbox
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {role === "ADMIN" ? "Все переписки студии" : "Переписки с твоими клиентами"}
        </p>
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
                  <div className="font-medium text-gray-800 text-sm truncate">
                    {c.clientName || formatPhone(c.clientPhone)}
                  </div>
                  <div className="text-[10px] text-gray-400 flex-shrink-0">
                    {formatDistanceToNowStrict(new Date(c.lastMessageAt), { addSuffix: false })}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="text-xs text-gray-500 truncate flex-1">
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
    <div className="flex-1 flex flex-col bg-[#ECE5DD] min-w-0 h-full">
      {/* Chat header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 flex-shrink-0">
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
          <div className="font-medium text-gray-800 truncate">
            {detail?.clientName || formatPhone(detail?.clientPhone ?? "")}
          </div>
          <div className="text-xs text-gray-500 truncate">{formatPhone(detail?.clientPhone ?? "")}</div>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2">
        {loadingDetail && !detail ? (
          <div className="text-center text-gray-400 text-sm py-8">
            <Loader2 size={16} className="animate-spin inline mr-2" /> Loading...
          </div>
        ) : (
          <>
            {detail?.messages.map((m) => (
              <MessageBubble key={m.id} m={m} role={role} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Composer */}
      <div className="bg-white border-t border-gray-100 px-3 sm:px-4 py-3 flex-shrink-0">
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
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={windowOpen ? "Напиши сообщение..." : "Окно закрыто — нужен шаблон"}
            disabled={!windowOpen || sending}
            rows={1}
            className="flex-1 resize-none border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] disabled:bg-gray-50 disabled:text-gray-400 max-h-32"
            style={{ minHeight: 40 }}
          />
          <button
            onClick={send}
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
    </div>
  )

  return (
    <div className="h-[calc(100vh-72px)] lg:h-[calc(100vh-64px)] -m-4 lg:-m-8 flex bg-white overflow-hidden">
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
