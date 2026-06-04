"use client"

import { useState, useEffect, useCallback } from "react"
import { format, addDays } from "date-fns"
import { Search, ChevronDown, MessageCircle, Calendar, Phone, Send, User, Clock, CreditCard, CheckCircle2, StickyNote, Sparkles, Copy, Check, X } from "lucide-react"
import { whatsappLink, bookingConfirmationMessage } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"
import { PetalSpinner } from "@/app/_components/PetalSpinner"

type Booking = {
  id: string
  clientName: string
  clientPhone: string
  clientTelegram?: string
  status: string
  paymentType: string
  paymentStatus: string
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

const PAYMENT_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label])
)

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
      className="p-1.5 text-gray-400 hover:text-[#2C6E49] hover:bg-[#2C6E49]/5 rounded-md transition-colors"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

function BookingDetails({
  booking, isUpdating, onUpdate, onCancel,
}: {
  booking: Booking
  isUpdating: boolean
  onUpdate: (data: Record<string, string>) => Promise<void> | void
  onCancel: () => void
}) {
  const [noteDraft, setNoteDraft] = useState(booking.notes ?? "")
  const [noteSaved, setNoteSaved] = useState(false)
  const cleanName = booking.clientName.replace(/\s*\(\d+\/\d+\)$/, "")
  const wa = whatsappLink(
    booking.clientPhone,
    bookingConfirmationMessage({
      clientName: cleanName,
      date: format(new Date(booking.slot.date), "EEE, MMM d"),
      time: formatTime(booking.slot.startTime),
      ticketCode: booking.ticketCode || "",
    })
  )

  const saveNote = () => {
    const trimmed = noteDraft.trim()
    if (trimmed === (booking.notes ?? "").trim()) return
    Promise.resolve(onUpdate({ notes: trimmed })).then(() => {
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 1500)
    })
  }

  return (
    <div className="px-4 lg:px-6 py-5 bg-[#2C6E49]/[0.03] border-t border-[#2C6E49]/15 space-y-4">
      {/* Top meta row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetaCell icon={<Calendar size={13} />} label="Date" value={format(new Date(booking.slot.date), "EEE, MMM d")} />
        <MetaCell icon={<Clock size={13} />} label="Time" value={`${formatTime(booking.slot.startTime)} – ${formatTime(booking.slot.endTime)}`} />
        <MetaCell icon={<User size={13} />} label="Trainer" value={booking.slot.trainer?.name ?? "—"} />
        <MetaCell icon={<Calendar size={13} />} label="Booked on" value={format(new Date(booking.createdAt), "MMM d")} />
      </div>

      {/* Two-column main layout: contact + payment | services + notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Contact card */}
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-1.5 mb-3">
            <Phone size={14} className="text-[#2C6E49]" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 group">
              <Phone size={14} className="text-gray-400 flex-shrink-0" />
              <a href={`tel:${booking.clientPhone}`} className="text-sm text-gray-800 hover:text-[#2C6E49] flex-1 truncate">
                {booking.clientPhone}
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
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-2 w-full flex items-center justify-center gap-2 text-sm font-medium bg-[#25D366] hover:bg-[#1da851] text-white px-3 py-2 rounded-lg transition-colors"
              >
                <MessageCircle size={14} /> Send WhatsApp confirmation
              </a>
            )}
          </div>
        </div>

        {/* Payment card */}
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-1.5 mb-3">
            <CreditCard size={14} className="text-[#2C6E49]" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment</h3>
          </div>

          {booking.paymentStatus === "PAID" ? (
            <div className="flex items-center justify-between gap-2 bg-[#2C6E49]/5 border border-[#2C6E49]/20 rounded-lg px-3 py-2">
              <span className="flex items-center gap-1.5 text-sm font-medium text-[#2C6E49]">
                <CheckCircle2 size={14} />
                Paid · {PAYMENT_LABEL[booking.paymentType] ?? booking.paymentType}
              </span>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => onUpdate({ paymentType: "PENDING", paymentStatus: "UNPAID" })}
                className="text-[11px] text-[#2C6E49]/70 hover:text-[#2C6E49] underline disabled:opacity-50"
              >
                Undo
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] text-gray-400 mb-1.5 font-medium">Mark as paid with</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.value}
                    type="button"
                    disabled={isUpdating}
                    onClick={() => onUpdate({ paymentType: pm.value, paymentStatus: "PAID" })}
                    className={cn(
                      "px-2 py-2 rounded-lg text-xs font-medium border text-center truncate touch-manipulation",
                      "bg-white text-gray-500 border-gray-200 hover:border-[#2C6E49]/40 hover:text-[#2C6E49]"
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

      {/* Services + Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {booking.services.length > 0 && (
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <div className="flex items-center gap-1.5 mb-3">
              <Sparkles size={14} className="text-[#2C6E49]" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Additional services</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {booking.services.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-[#2C6E49]/5 text-[#2C6E49] px-2.5 py-1 rounded-lg font-medium">
                  {s.service.name}
                  <span className="text-[#2C6E49]/60">·</span>
                  <span className="text-[#2C6E49]/80">{Math.round(s.service.price / 1000)}k</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={cn("bg-white rounded-xl p-4 border border-gray-100", booking.services.length === 0 && "lg:col-span-2")}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <StickyNote size={14} className="text-[#2C6E49]" />
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</h3>
            </div>
            {noteSaved && (
              <span className="text-[10px] text-green-600 flex items-center gap-1">
                <Check size={10} /> Saved
              </span>
            )}
          </div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.currentTarget.blur()
              }
            }}
            onClick={(e) => e.stopPropagation()}
            rows={2}
            disabled={isUpdating}
            placeholder="Add a note about this client..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] resize-none disabled:opacity-50"
          />
        </div>
      </div>

      {/* Cancel — same action as in Schedule / Schedule Beta. Hidden once the
          client has paid for the class (a paid booking can't be cancelled here). */}
      {booking.paymentStatus !== "PAID" && (
        <div className="flex justify-end pt-1">
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

function MetaCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-white/60 border border-gray-100">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-0.5">
        <span className="text-gray-300">{icon}</span>
        {label}
      </div>
      <div className="text-sm font-medium text-gray-700 truncate">{value}</div>
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  // Optimistic update — apply locally first, then sync to the server.
  // No "loading" / disabled state — the UI reacts in the same frame.
  const updateBooking = async (id: string, data: Record<string, string>) => {
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
      alert("Network error — couldn't cancel the booking. Please try again.")
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
    inRange(b.slot.date)
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bookings</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
          />
        </div>
        <div className="relative">
          <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value); setRange("all") }}
            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] bg-white"
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
                ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                : "bg-white text-gray-600 border-gray-200 hover:border-[#2C6E49]/40"
            )}
          >
            {r.label}
          </button>
        ))}
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
                    isExpanded && "relative z-10 my-2 mx-2 lg:mx-3 rounded-xl ring-1 ring-[#2C6E49]/25 shadow-sm overflow-hidden bg-white dark:bg-white/[0.05] dark:border-[#4cae7a]/50"
                  )}
                >
                  <div
                    className={cn(
                      "grid [grid-template-columns:1.5fr_1.5fr_1fr_30px] lg:[grid-template-columns:2fr_2fr_1fr_1fr_1fr_40px] gap-3 lg:gap-4 px-4 lg:px-6 py-4 items-center cursor-pointer transition-colors",
                      isExpanded ? "bg-[#2C6E49]/5" : "hover:bg-gray-50"
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : b.id)}
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-gray-800 truncate">{b.clientName}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-gray-800">
                        <span className="lg:hidden">{format(new Date(b.slot.date), "MMM d")}</span>
                        <span className="hidden lg:inline">{format(new Date(b.slot.date), "MMM d, yyyy")}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        <span className="lg:hidden">{formatTime24(b.slot.startTime)}</span>
                        <span className="hidden lg:inline">{formatTime(b.slot.startTime)} – {formatTime(b.slot.endTime)}</span>
                      </div>
                    </div>
                    <div className="hidden lg:block text-sm text-gray-600">{b.slot.trainer?.name ?? <span className="text-gray-400">—</span>}</div>
                    <div>
                      <span className={cn("text-[10px] lg:text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap", badge.cls)}>
                        {badge.label}
                      </span>
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
