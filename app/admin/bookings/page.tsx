"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { format, addDays } from "date-fns"
import { Search, ChevronDown, MessageCircle, Calendar, Phone, Send, CheckCircle2, Copy, Check, X } from "lucide-react"
import { useOpenChat } from "@/lib/use-open-chat"
import { cn } from "@/lib/utils"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { AddClientForm, type NewClient } from "@/app/_components/AddClientForm"

type Booking = {
  id: string
  clientName: string
  clientPhone: string
  clientTelegram?: string
  status: string
  paymentType: string
  paymentStatus: string
  localResident?: boolean
  notes?: string
  ticketCode?: string
  createdAt: string
  slot: {
    date: string
    startTime: string
    endTime: string
    trainer: { name: string } | null
  }
  services: { service: { name: string; price: number } }[]
  membershipRemaining?: number
  membershipId?: string | null
  // Staff-only "confirmed by bank" flag (a linked BankPayment).
  bankConfirmed?: boolean
  // Booked without a WhatsApp code (number couldn't receive one) - flag so the
  // admin double-checks contact details.
  phoneUnverified?: boolean
}

function formatTime(time: string) {
  // Admin always sees 24-hour format
  const [h, m] = time.split(":").map(Number)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function formatTime24(time: string) {
  const [h, m] = time.split(":").map(Number)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "EDC", label: "EDC" },
  { value: "QR", label: "QR" },
  { value: "TRANSFER", label: "Transfer" },
]

const PAYMENT_LABEL: Record<string, string> = {
  ...Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])),
  MEMBERSHIP: "Membership",
}

const paymentBadge = (type: string, status: string) => {
  if (status === "PAID") {
    const label = PAYMENT_LABEL[type] ?? (type === "ONLINE" ? "Online" : type === "OFFLINE" ? "Offline" : "Paid")
    return { label: `Paid · ${label}`, cls: "bg-green-50 text-green-700" }
  }
  return { label: "Unpaid", cls: "bg-yellow-50 text-yellow-700" }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      title="Copy"
      className="p-1.5 text-gray-400 hover:text-brand hover:bg-brand/5 rounded-md transition-colors"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

function BookingDetails({
  booking, isUpdating, onUpdate, onCancel, localCtx,
}: {
  booking: Booking
  isUpdating: boolean
  onUpdate: (data: Record<string, string | boolean>) => Promise<void> | void
  onCancel: () => void
  localCtx: { country: string | null; localPrice: number }
}) {
  const [noteDraft, setNoteDraft] = useState(booking.notes ?? "")
  const [noteSaved, setNoteSaved] = useState(false)
  const { openChat } = useOpenChat()

  const saveNote = () => {
    const trimmed = noteDraft.trim()
    if (trimmed === (booking.notes ?? "").trim()) return
    Promise.resolve(onUpdate({ notes: trimmed })).then(() => {
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 1500)
    })
  }

  return (
    <div className="px-4 lg:px-6 py-4 bg-brand/[0.03] border-t border-brand/15 space-y-3">
      {/* Date & time already live in the row header — here we only keep the
          secondary bits (trainer + booked-on) as quiet, de-emphasised text. */}
      <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap text-xs text-gray-400">
        <span>Trainer <span className="text-gray-500 font-medium">{booking.slot.trainer?.name ?? "-"}</span></span>
        <span>Booked <span className="text-gray-500 font-medium">{format(new Date(booking.createdAt), "MMM d")}</span></span>
      </div>

      {/* Contact + Payment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Contact — no heading; the phone/telegram speak for themselves */}
        <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-2">
          <div className="flex items-center gap-2 group">
            <Phone size={14} className="text-gray-400 flex-shrink-0" />
            <a href={`tel:+${booking.clientPhone.replace(/\D/g, "")}`} className="text-sm text-gray-800 hover:text-brand flex-1 truncate">
              {booking.clientPhone.match(/^\d+$/) ? `+${booking.clientPhone}` : booking.clientPhone}
            </a>
            <CopyButton value={booking.clientPhone} />
          </div>
          {booking.clientTelegram && (
            <div className="flex items-center gap-2 group">
              <Send size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-800 flex-1 truncate">{booking.clientTelegram}</span>
              <CopyButton value={booking.clientTelegram} />
            </div>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openChat(booking.clientPhone, booking.clientName) }}
            className="mt-0.5 w-full flex items-center justify-center gap-2 text-sm font-medium bg-brand/10 hover:bg-brand/20 text-brand border border-brand/25 px-3 py-2 rounded-lg transition-colors"
          >
            <MessageCircle size={14} /> Открыть чат
          </button>
        </div>

        {/* Payment — no "Mark as paid with" label, it's self-evident */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          {booking.paymentStatus === "PAID" ? (
            <div className="flex items-center justify-between gap-2 bg-brand/5 border border-brand/20 rounded-lg px-3 py-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-brand">
                <CheckCircle2 size={14} />
                Paid · {PAYMENT_LABEL[booking.paymentType] ?? booking.paymentType}
              </span>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => onUpdate({ paymentType: "PENDING", paymentStatus: "UNPAID" })}
                className="text-[11px] text-brand/70 hover:text-brand underline disabled:opacity-50"
              >
                Undo
              </button>
            </div>
          ) : (
            <div>
              {((booking.membershipRemaining ?? 0) > 0 || booking.membershipId != null) && (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => onUpdate({ paymentType: "MEMBERSHIP", paymentStatus: "PAID" })}
                  className="w-full mb-1.5 px-2 py-2 rounded-lg text-xs font-semibold border text-center touch-manipulation bg-white text-gray-700 border-gray-200 hover:border-brand/40 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  🎟️ Membership ({booking.membershipRemaining ?? 0} left)
                </button>
              )}
            <div className="grid grid-cols-4 gap-1.5">
              {PAYMENT_METHODS.map((pm) => (
                <button
                  key={pm.value}
                  type="button"
                  disabled={isUpdating}
                  onClick={() => onUpdate({ paymentType: pm.value, paymentStatus: "PAID" })}
                  className={cn(
                    "px-2 py-2 rounded-lg text-xs font-medium border text-center truncate touch-manipulation",
                    "bg-white text-gray-500 border-gray-200 hover:border-brand/40 hover:text-brand"
                  )}
                >
                  {pm.label}
                </button>
              ))}
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Local resident (Indonesia only): discounted class price for an
          Indonesian local. */}
      {localCtx.country === "ID" && (
        <button
          type="button"
          disabled={isUpdating}
          onClick={() => onUpdate({ localResident: !booking.localResident })}
          className={cn(
            "w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left touch-manipulation disabled:opacity-50",
            booking.localResident ? "bg-brand/5 border-brand/20" : "bg-white border-gray-200 hover:border-brand/40",
          )}
        >
          <span className={cn("w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0", booking.localResident ? "bg-brand border-brand" : "bg-white border-gray-300")}>
            {booking.localResident && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span className="text-sm font-medium text-gray-700 flex-1">Local (Indonesian resident)</span>
          <span className="text-xs font-semibold text-brand">{Math.round(localCtx.localPrice / 1000)}k</span>
        </button>
      )}

      {/* Services — only if any; just the chips, compact */}
      {booking.services.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {booking.services.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-brand/5 text-brand px-2.5 py-1 rounded-lg font-medium">
              {s.service.name}
              <span className="text-brand/60">·</span>
              <span className="text-brand/80">{Math.round(s.service.price / 1000)}k</span>
            </span>
          ))}
        </div>
      )}

      {/* Notes — a single light line; the label lives in the placeholder */}
      <div className="relative">
        <input
          type="text"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
          onClick={(e) => e.stopPropagation()}
          disabled={isUpdating}
          placeholder="Notes"
          className="w-full bg-white border border-gray-100 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand disabled:opacity-50"
        />
        {noteSaved && <Check size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-600" />}
      </div>

      {/* Cancel — same action as in Schedule / Schedule Beta. Hidden once the
          client has paid for the class (a paid booking can't be cancelled here). */}
      {booking.paymentStatus !== "PAID" && (
        <div className="flex justify-end items-center gap-2 pt-1">
          <button
            type="button"
            disabled={isUpdating}
            onClick={onCancel}
            title="Cancel this booking"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95 transition disabled:opacity-50"
          >
            <X size={14} strokeWidth={2.5} />
            Cancel booking
          </button>
        </div>
      )}
    </div>
  )
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [search, setSearch] = useState("")
  const [dateFilter, setDateFilter] = useState("")
  // Quick date-range chips for "who's booked today / tomorrow / this week /
  // this month". Filters client-side on the class date.
  const [range, setRange] = useState<"all" | "today" | "tomorrow" | "week" | "month">("all")
  // "Who hasn't paid?" is the admin's daily money question - a one-tap filter
  // instead of scanning payment badges row by row. Deep-linkable from the
  // Dashboard's "Unpaid Today" card via ?pay=unpaid.
  const [unpaidOnly, setUnpaidOnly] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("pay") === "unpaid") {
      setUnpaidOnly(true)
      setRange("today")
    }
  }, [])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Studio country + local price drive the "Local" toggle (Indonesia only).
  const [localCtx, setLocalCtx] = useState<{ country: string | null; localPrice: number }>({ country: null, localPrice: 200000 })

  useEffect(() => {
    fetch("/api/admin/studio").then((r) => r.json()).then((d) => {
      setLocalCtx({ country: d.country ?? null, localPrice: d.localPrice ?? 200000 })
    }).catch(() => {})
  }, [])

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const url = dateFilter ? `/api/admin/bookings?date=${dateFilter}` : "/api/admin/bookings"
      const res = await fetch(url)
      setBookings(await res.json())
    } finally {
      setLoading(false)
    }
  }, [dateFilter])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  // "+ New booking" - the page named Bookings could not create one; a phone
  // call booking forced a detour through the Schedule day editor. Pick an
  // upcoming class here, fill the same AddClientForm, done.
  const [newOpen, setNewOpen] = useState(false)
  type NewSlot = { id: string; date: string; startTime: string; classType: string; maxCapacity: number; trainer: { name: string } | null; _count: { bookings: number } }
  const [newSlots, setNewSlots] = useState<NewSlot[] | null>(null)
  const [newSlotId, setNewSlotId] = useState("")
  const [newSaving, setNewSaving] = useState(false)
  const [newErr, setNewErr] = useState("")
  useEffect(() => {
    if (!newOpen || newSlots !== null) return
    const from = format(new Date(), "yyyy-MM-dd")
    const to = format(addDays(new Date(), 30), "yyyy-MM-dd")
    fetch(`/api/admin/slots?from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: NewSlot[]) => setNewSlots(
        list.filter((s) => !!s.trainer && s._count.bookings < s.maxCapacity)
      ))
      .catch(() => setNewSlots([]))
  }, [newOpen, newSlots])
  const submitNewBooking = async (c: NewClient) => {
    if (!newSlotId) { setNewErr("Pick a class first"); return }
    setNewSaving(true)
    setNewErr("")
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: newSlotId,
          clientName: c.clientName,
          clientPhone: c.clientPhone,
          clientEmail: c.clientEmail || undefined,
          partySize: c.partySize || 1,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setNewErr(e.error ?? "Couldn't create the booking.")
        return
      }
      setNewOpen(false)
      setNewSlotId("")
      fetchBookings()
    } catch {
      setNewErr("Network error - please try again.")
    } finally {
      setNewSaving(false)
    }
  }

  // Auto-refresh: surface new bookings without a manual reload. Silent (no
  // spinner) refetch every 20s and the instant the tab regains focus/visibility.
  // Paused while a row is being updated so a poll can't overwrite an optimistic
  // change with stale data.
  const refreshBookings = useCallback(async () => {
    const url = dateFilter ? `/api/admin/bookings?date=${dateFilter}` : "/api/admin/bookings"
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (res.ok) setBookings(await res.json())
    } catch {}
  }, [dateFilter])

  const updatingRef = useRef<string | null>(null)
  useEffect(() => { updatingRef.current = updating }, [updating])
  useEffect(() => {
    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      if (updatingRef.current) return
      refreshBookings()
    }
    const id = setInterval(refresh, 30000)
    const onFocus = () => refresh()
    const onVis = () => { if (document.visibilityState === "visible") refresh() }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVis)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [refreshBookings])

  // Optimistic update — apply locally first, then sync to the server.
  // No "loading" / disabled state — the UI reacts in the same frame.
  const updateBooking = async (id: string, data: Record<string, string | boolean>) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)))
    try {
      await fetch(`/api/admin/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    } catch {
      // Network error — pull authoritative state back
      fetchBookings()
    }
  }

  // Cancel a booking — identical mechanism to Schedule / Schedule Beta:
  // confirm, optimistically drop it from the list, then PATCH status=CANCELLED.
  const cancelBooking = async (id: string, name: string) => {
    const cleanName = name.replace(/\s*\(\d+\/\d+\)$/, "")
    if (!confirm(`Cancel ${cleanName}'s booking?`)) return
    setBookings((prev) => prev.filter((b) => b.id !== id))
    setExpandedId(null)
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert(e.error ?? "Couldn't cancel the booking. Please try again.")
        fetchBookings()
      }
    } catch {
      alert("Network error - couldn't cancel the booking. Please try again.")
      fetchBookings()
    }
  }

  // Date-range bounds (studio-local class dates as yyyy-MM-dd strings).
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const tomorrowStr = format(addDays(new Date(), 1), "yyyy-MM-dd")
  const weekEndStr = format(addDays(new Date(), 6), "yyyy-MM-dd")
  const monthEndStr = format(addDays(new Date(), 29), "yyyy-MM-dd")
  const inRange = (d: string) => {
    if (range === "today") return d === todayStr
    if (range === "tomorrow") return d === tomorrowStr
    if (range === "week") return d >= todayStr && d <= weekEndStr
    if (range === "month") return d >= todayStr && d <= monthEndStr
    return true
  }

  const filtered = bookings.filter((b) =>
    (!search ||
      b.clientName.toLowerCase().includes(search.toLowerCase()) ||
      b.clientPhone.includes(search)) &&
    inRange(b.slot.date) &&
    (!unpaidOnly || (b.paymentStatus !== "PAID" && b.status !== "CANCELLED"))
  )

  const RANGES: { value: typeof range; label: string }[] = [
    { value: "all", label: "All" },
    { value: "today", label: "Today" },
    { value: "tomorrow", label: "Tomorrow" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
  ]

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark touch-manipulation whitespace-nowrap"
        >
          + New booking
        </button>
      </div>

      {/* New booking modal: pick an upcoming class, then the shared client
          form (phone-first with name autofill). */}
      {newOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !newSaving && setNewOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">New booking</h2>
              <button onClick={() => !newSaving && setNewOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto">
              <label className="block text-xs text-gray-500 font-medium mb-1.5">Class</label>
              {newSlots === null ? (
                <div className="py-4"><PetalSpinner /></div>
              ) : newSlots.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No upcoming classes with free spots. Create one in Schedule first.</p>
              ) : (
                <select
                  value={newSlotId}
                  onChange={(e) => setNewSlotId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 mb-4"
                >
                  <option value="">Pick a class...</option>
                  {newSlots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {format(new Date(s.date + "T00:00:00"), "EEE, MMM d")} · {s.startTime} · {s.trainer?.name} ({s.maxCapacity - s._count.bookings} free)
                    </option>
                  ))}
                </select>
              )}
              {newSlotId && (
                <AddClientForm
                  maxParty={Math.max(1, (newSlots?.find((s) => s.id === newSlotId)?.maxCapacity ?? 1) - (newSlots?.find((s) => s.id === newSlotId)?._count.bookings ?? 0))}
                  submitting={newSaving}
                  onSubmit={submitNewBooking}
                  onCancel={() => setNewOpen(false)}
                />
              )}
              {newErr && <div className="mt-2 text-xs text-red-600">{newErr}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
        <div className="relative">
          <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value); setRange("all") }}
            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white"
          />
        </div>
        {dateFilter && (
          <button onClick={() => { setDateFilter(""); }} className="text-sm text-gray-500 hover:text-gray-800 px-2">Clear</button>
        )}
      </div>

      {/* Quick date-range filter */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => { setRange(r.value); setDateFilter("") }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium border",
              range === r.value && !dateFilter
                ? "bg-brand text-white border-brand"
                : "bg-white text-gray-600 border-gray-200 hover:border-brand/40"
            )}
          >
            {r.label}
          </button>
        ))}
        <span className="w-px self-stretch bg-gray-200 mx-1" aria-hidden />
        <button
          type="button"
          onClick={() => setUnpaidOnly((v) => !v)}
          className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-medium border",
            unpaidOnly
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-white text-amber-700 border-amber-200 hover:border-amber-400"
          )}
        >
          Unpaid
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="grid [grid-template-columns:1.5fr_1.5fr_1fr_30px] lg:[grid-template-columns:2fr_2fr_1fr_1fr_1fr_40px] gap-3 lg:gap-4 px-4 lg:px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div>Client</div>
          <div>Session</div>
          <div className="hidden lg:block">Trainer</div>
          <div>Payment</div>
          <div className="hidden lg:block">Booked</div>
          <div />
        </div>

        {loading ? (
          <PetalSpinner />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No bookings found</div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-transparent">
            {filtered.map((b) => {
              const badge = paymentBadge(b.paymentType, b.paymentStatus)
              const isExpanded = expandedId === b.id

              return (
                <div
                  key={b.id}
                  className={cn(
                    // Dark mode: each client is a clearly framed card so rows
                    // don't melt into the dark background (the light-mode
                    // divide-gray-50 separators are invisible on dark).
                    "dark:border dark:border-white/15 dark:rounded-xl dark:bg-white/[0.03] dark:mx-2 dark:my-2",
                    isExpanded && "relative z-10 my-2 mx-2 lg:mx-3 rounded-xl ring-1 ring-brand/25 shadow-sm overflow-hidden bg-white dark:bg-white/[0.05] dark:border-[#4cae7a]/50"
                  )}
                >
                  <div
                    className={cn(
                      "grid [grid-template-columns:1.5fr_1.5fr_1fr_30px] lg:[grid-template-columns:2fr_2fr_1fr_1fr_1fr_40px] gap-3 lg:gap-4 px-4 lg:px-6 py-4 items-center cursor-pointer transition-colors",
                      isExpanded ? "bg-brand/5" : "hover:bg-gray-50"
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : b.id)}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-800 truncate">
                        {b.clientName}
                        {b.phoneUnverified && (
                          <span className="ml-1.5 align-middle text-[9px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full whitespace-nowrap" title="Phone not confirmed on WhatsApp">unverified</span>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-gray-800">
                        <span className="lg:hidden">{format(new Date(b.slot.date), "MMM d")}</span>
                        <span className="hidden lg:inline">{format(new Date(b.slot.date), "MMM d, yyyy")}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        <span className="lg:hidden">{formatTime24(b.slot.startTime)}</span>
                        <span className="hidden lg:inline">{formatTime(b.slot.startTime)} - {formatTime(b.slot.endTime)}</span>
                      </div>
                    </div>
                    <div className="hidden lg:block text-sm text-gray-600">{b.slot.trainer?.name ?? <span className="text-gray-400">-</span>}</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn("text-[10px] lg:text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap", badge.cls)}>
                        {badge.label}
                      </span>
                      {b.bankConfirmed ? (
                        <span className="text-[10px] lg:text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap bg-emerald-100 text-emerald-700" title="Payment confirmed by bank">
                          ✓ bank
                        </span>
                      ) : null}
                    </div>
                    <div className="hidden lg:block text-xs text-gray-400">
                      {format(new Date(b.createdAt), "MMM d")}
                    </div>
                    <div>
                      <ChevronDown size={16} className={cn("text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                    </div>
                  </div>

                  {isExpanded && (
                    <BookingDetails
                      booking={b}
                      isUpdating={updating === b.id}
                      onUpdate={(data) => updateBooking(b.id, data)}
                      onCancel={() => cancelBooking(b.id, b.clientName)}
                      localCtx={localCtx}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
