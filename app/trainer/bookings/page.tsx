"use client"

import { useState, useEffect, useCallback } from "react"
import { format } from "date-fns"
import { CheckCircle2, Calendar, Clock, CreditCard, StickyNote, Sparkles, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { PetalSpinner } from "@/app/_components/PetalSpinner"

type Booking = {
  id: string
  clientName: string
  clientPhone: string
  clientTelegram?: string
  paymentType: string
  paymentStatus: string
  notes?: string
  createdAt: string
  slot: { date: string; startTime: string; endTime: string }
  services: { service: { id: string; name: string; price: number }; paymentType?: string | null }[]
  // Membership balance for this client at the studio (from the API).
  membershipRemaining?: number
  membershipId?: string | null
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

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
}

const paymentBadge = (type: string, status: string) => {
  if (status === "PAID") {
    const label = PAYMENT_LABEL[type] ?? (type === "ONLINE" ? "Online" : type === "OFFLINE" ? "Offline" : "Paid")
    return { label: `Paid · ${label}`, cls: "bg-green-50 text-green-700" }
  }
  return { label: "Unpaid", cls: "bg-yellow-50 text-yellow-700" }
}

export default function TrainerBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [updating, setUpdating] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/trainer/bookings")
      setBookings(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  // Optimistic update — UI changes instantly, server syncs in background
  const updateBooking = async (id: string, data: Record<string, string>) => {
    setUpdating(id)
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)))
    try {
      const res = await fetch(`/api/trainer/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      // Pull back authoritative fields (membership balance after a deduction).
      if (res.ok) {
        const saved = await res.json()
        setBookings((prev) => prev.map((b) => (b.id === id ? {
          ...b,
          paymentType: saved.paymentType ?? b.paymentType,
          paymentStatus: saved.paymentStatus ?? b.paymentStatus,
          membershipId: saved.membershipId ?? null,
          membershipRemaining: typeof saved.membershipRemaining === "number" ? saved.membershipRemaining : b.membershipRemaining,
        } : b)))
      } else {
        fetchBookings()
      }
    } catch {
      fetchBookings()
    } finally {
      setUpdating(null)
    }
  }

  // Per-service payment (only relevant when the session is on a membership).
  const setServicePayment = async (bookingId: string, serviceId: string, method: string) => {
    setBookings((prev) => prev.map((b) => b.id !== bookingId ? b : {
      ...b,
      services: b.services.map((s) => s.service.id === serviceId ? { ...s, paymentType: method } : s),
    }))
    try {
      await fetch(`/api/trainer/bookings/${bookingId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, paymentType: method }),
      })
    } catch {
      fetchBookings()
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">All My Bookings</h1>

      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm"><PetalSpinner /></div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400 text-sm shadow-sm">
          No bookings yet
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {bookings.map((b) => {
              const badge = paymentBadge(b.paymentType, b.paymentStatus)
              const isExpanded = expandedId === b.id

              return (
                <div
                  key={b.id}
                  className={cn(
                    isExpanded && "relative z-10 my-2 mx-2 lg:mx-3 rounded-xl ring-1 ring-[#2C6E49]/25 shadow-sm overflow-hidden bg-white"
                  )}
                >
                  <div
                    className={cn(
                      "px-4 lg:px-6 py-4 cursor-pointer flex items-center justify-between gap-3 transition-colors",
                      isExpanded ? "bg-[#2C6E49]/5" : "hover:bg-gray-50"
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : b.id)}
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-3 lg:gap-4">
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-gray-800 truncate">{b.clientName}</div>
                        <div className="text-xs text-gray-400 mt-0.5 lg:hidden">
                          {format(new Date(b.slot.date), "MMM d")} · {formatTime(b.slot.startTime)}
                        </div>
                      </div>
                      <div className="hidden lg:block text-sm text-gray-600 whitespace-nowrap">
                        {format(new Date(b.slot.date), "MMM d")} · {formatTime(b.slot.startTime)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
                      <span className={cn("text-[10px] lg:text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap", badge.cls)}>
                        {badge.label}
                      </span>
                      <ChevronDown size={16} className={cn("text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                    </div>
                  </div>

                  {isExpanded && (
                    <BookingDetails
                      booking={b}
                      isUpdating={updating === b.id}
                      onUpdate={(data) => updateBooking(b.id, data)}
                      onServicePayment={(serviceId, method) => setServicePayment(b.id, serviceId, method)}
                      onDone={() => setExpandedId(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
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

function BookingDetails({
  booking, isUpdating, onUpdate, onServicePayment, onDone,
}: {
  booking: Booking
  isUpdating: boolean
  onUpdate: (data: Record<string, string>) => Promise<void> | void
  onServicePayment: (serviceId: string, method: string) => Promise<void> | void
  onDone: () => void
}) {
  const isMembership = booking.paymentType === "MEMBERSHIP"
  const canUseMembership = (booking.membershipRemaining ?? 0) > 0 || isMembership

  return (
    <div className="px-4 lg:px-6 py-5 bg-[#2C6E49]/[0.03] border-t border-[#2C6E49]/15 space-y-4">
      {/* Top meta row */}
      <div className="grid grid-cols-3 gap-2">
        <MetaCell icon={<Calendar size={13} />} label="Date" value={format(new Date(booking.slot.date), "EEE, MMM d")} />
        <MetaCell icon={<Clock size={13} />} label="Time" value={`${formatTime(booking.slot.startTime)} – ${formatTime(booking.slot.endTime)}`} />
        <MetaCell icon={<Calendar size={13} />} label="Booked on" value={format(new Date(booking.createdAt), "MMM d")} />
      </div>

      {/* Payment */}
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex items-center gap-1.5 mb-3">
          <CreditCard size={14} className="text-[#2C6E49]" />
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment</h3>
        </div>

        {booking.paymentStatus === "PAID" ? (
          <div className="flex items-center justify-between gap-2 bg-[#2C6E49]/5 border border-[#2C6E49]/20 rounded-lg px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-[#2C6E49]">
              <CheckCircle2 size={14} />
              Paid · {isMembership ? `Membership${typeof booking.membershipRemaining === "number" ? ` (${booking.membershipRemaining} left)` : ""}` : (PAYMENT_LABEL[booking.paymentType] ?? booking.paymentType)}
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
            {canUseMembership && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => onUpdate({ paymentType: "MEMBERSHIP", paymentStatus: "PAID" })}
                className="w-full mb-1.5 px-2 py-2 rounded-lg text-xs font-semibold border text-center touch-manipulation bg-white text-gray-700 border-gray-200 hover:border-[#2C6E49]/40 flex items-center justify-center gap-1.5 disabled:opacity-50"
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

      {/* Services — only if any. When the session is on a membership, each
          add-on needs its own money method (the pass doesn't cover extras),
          so we show a selector; otherwise the extra rides with the session. */}
      {booking.services.length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles size={14} className="text-[#2C6E49]" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Services</h3>
          </div>
          {isMembership ? (
            <div className="space-y-2">
              {booking.services.map((s) => (
                <div key={s.service.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-gray-800">{s.service.name}</span>
                    <span className="text-[#2C6E49] font-semibold">{Math.round(s.service.price / 1000)}k</span>
                  </div>
                  <div className="flex gap-1">
                    {PAYMENT_METHODS.map((pm) => {
                      const active = (s.paymentType ?? "CASH") === pm.value
                      return (
                        <button
                          key={pm.value}
                          type="button"
                          onClick={() => onServicePayment(s.service.id, pm.value)}
                          className={cn(
                            "flex-1 py-1 rounded-md text-[11px] font-semibold border touch-manipulation",
                            active ? "bg-[#2C6E49] text-white border-[#2C6E49]" : "bg-white text-gray-500 border-gray-200"
                          )}
                        >
                          {pm.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {booking.services.map((s) => (
                <span key={s.service.id} className="inline-flex items-center gap-1.5 text-xs bg-[#2C6E49]/5 text-[#2C6E49] px-2.5 py-1 rounded-lg font-medium">
                  {s.service.name}
                  <span className="text-[#2C6E49]/60">·</span>
                  <span className="text-[#2C6E49]/80">{Math.round(s.service.price / 1000)}k</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes — only if the trainer added something in My Schedule, read-only here */}
      {booking.notes && booking.notes.trim().length > 0 && (
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center gap-1.5 mb-2">
            <StickyNote size={14} className="text-[#2C6E49]" />
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Note</h3>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}

      {/* Once payment is set (general method or, on a membership, each service
          method), a clear green "Done" button collapses this booking back to
          its one-line row — same flow as the My Schedule class view. */}
      {booking.paymentStatus === "PAID" && (
        <button
          type="button"
          onClick={onDone}
          className="w-full py-3 rounded-xl bg-[#2C6E49] text-white text-sm font-semibold hover:bg-[#1E4D34] touch-manipulation flex items-center justify-center gap-2"
        >
          ✓ Done — collapse
        </button>
      )}
    </div>
  )
}
