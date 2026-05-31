"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth } from "date-fns"
import { ChevronLeft, ChevronRight, Users, X } from "lucide-react"
import { whatsappLink } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import { WhatsAppIcon } from "@/app/_components/WhatsAppIcon"

type Slot = {
  id: string
  date: string
  startTime: string
  endTime: string
  state: "mine" | "unassigned" | "other"
  maxCapacity?: number
  price?: number
  _count?: { bookings: number }
}

type Service = { id: string; name: string; price: number }

type Booking = {
  id: string
  clientName: string
  clientPhone: string
  clientTelegram?: string
  paymentType: string
  paymentStatus: string
  checkedIn: boolean
  notes?: string
  services: { service: Service; paymentType?: string | null }[]
  slot: { id: string }
  // Membership: how many classes the client has left at this studio, and the
  // pass id this booking was charged to (set when paymentType === "MEMBERSHIP").
  membershipRemaining?: number
  membershipId?: string | null
}

type Salary = {
  baseSalary: number
  commissionRate: number
  totalPaid: number
  commission: number
  total: number
  paidBookingsCount: number
  month: string
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "EDC", label: "EDC" },
  { value: "QR", label: "QR" },
  { value: "TRANSFER", label: "Transfer" },
]

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
}

function formatIDR(amount: number) {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000
    const str = m % 1 === 0 ? m.toString() : m.toFixed(1).replace(/\.0$/, "")
    return `${str}M`
  }
  if (amount >= 1000) return `${Math.round(amount / 1000)}k`
  return Math.round(amount).toString()
}

type View = "week" | "month"

export default function TrainerSchedulePage() {
  // Stable reference — created once per mount so it doesn't re-trigger
  // effects on every render (which caused a visible "blink" / re-scroll
  // in Month view).
  const today = useMemo(() => new Date(), [])
  const todayStart = useMemo(() => startOfMonth(today), [today])
  const nextMonthStart = useMemo(() => startOfMonth(addMonths(today, 1)), [today])

  const [view, setView] = useState<View>("week")
  const [monthAnchor, setMonthAnchor] = useState(startOfMonth(today))
  const todayCellRef = useRef<HTMLDivElement>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [salary, setSalary] = useState<Salary | null>(null)
  const [verifyCodes, setVerifyCodes] = useState<Record<string, string>>({})
  const [verifyStates, setVerifyStates] = useState<Record<string, "ok" | "error" | "idle">>({})
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)")
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  // Lock body scroll only when the booking list is open as a full-screen modal (mobile)
  useBodyScrollLock(isMobile && selectedSlot !== null)

  const todayStr = format(today, "yyyy-MM-dd")

  // Compute the visible date range based on view
  const range = (() => {
    if (view === "week") {
      // 7 days starting from today (no left/right navigation)
      const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
      return { start: today, end: addDays(today, 6), days }
    }
    // month — full calendar grid so columns line up by weekday
    const mStart = startOfMonth(monthAnchor)
    const mEnd = endOfMonth(monthAnchor)
    const gridStart = startOfWeek(mStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(mEnd, { weekStartsOn: 1 })
    const days: Date[] = []
    let d = gridStart
    while (d <= gridEnd) { days.push(d); d = addDays(d, 1) }
    return { start: mStart, end: mEnd, days }
  })()

  const from = format(range.start, "yyyy-MM-dd")
  const to = format(range.end, "yyyy-MM-dd")

  const fetchSlots = useCallback(async () => {
    const res = await fetch(`/api/trainer/schedule?from=${from}&to=${to}`)
    setSlots(await res.json())
  }, [from, to])

  const fetchSalary = useCallback(async () => {
    const res = await fetch("/api/trainer/salary")
    if (res.ok) setSalary(await res.json())
  }, [])

  const fetchServices = useCallback(async () => {
    const res = await fetch("/api/trainer/services")
    if (res.ok) setServices(await res.json())
  }, [])

  useEffect(() => { fetchSlots() }, [fetchSlots])
  useEffect(() => {
    Promise.all([fetchSalary(), fetchServices()])
  }, [fetchSalary, fetchServices])

  // When entering Month view on the current month, scroll to today's cell.
  // Fire once per (view, month) — independent of slots, so it works even when
  // the month is empty. Double rAF lets layout settle (sticky header + grid).
  const scrolledKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (view !== "month") return
    if (monthAnchor.getMonth() !== today.getMonth() || monthAnchor.getFullYear() !== today.getFullYear()) return
    const key = `${view}-${format(monthAnchor, "yyyy-MM")}`
    if (scrolledKeyRef.current === key) return
    scrolledKeyRef.current = key
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        todayCellRef.current?.scrollIntoView({ behavior: "auto", block: "start" })
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [view, monthAnchor, today])

  // Reset the scroll-once guard when leaving Month view OR when navigating
  // away from the current month — so re-entering re-scrolls.
  useEffect(() => {
    if (view !== "month") scrolledKeyRef.current = null
    else if (monthAnchor.getMonth() !== today.getMonth() || monthAnchor.getFullYear() !== today.getFullYear()) {
      scrolledKeyRef.current = null
    }
  }, [view, monthAnchor, today])

  const fetchBookingsForSlot = useCallback(async (slotId: string) => {
    const res = await fetch(`/api/trainer/bookings?slotId=${slotId}`)
    setBookings(await res.json())
  }, [])

  const handleSlotClick = (slot: Slot) => {
    setSelectedSlot(slot)
    fetchBookingsForSlot(slot.id)
    setVerifyCodes({})
    setVerifyStates({})
  }

  const handleVerify = async (bookingId: string, code: string) => {
    if (code.length !== 3) return
    const res = await fetch("/api/trainer/bookings/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, code }),
    })
    if (res.ok) {
      setVerifyStates((prev) => ({ ...prev, [bookingId]: "ok" }))
      fetchBookingsForSlot(selectedSlot!.id)
    } else {
      setVerifyStates((prev) => ({ ...prev, [bookingId]: "error" }))
    }
  }

  // Optimistic update — apply locally first, then sync to server in the
  // background. This avoids the "blink" of disabled state on every tap.
  const updateBooking = async (id: string, data: Record<string, string>) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)))
    try {
      const res = await fetch(`/api/trainer/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        // e.g. tried to charge a membership with no balance left — revert.
        let msg = "Не удалось обновить оплату."
        try {
          const err = await res.json()
          if (err?.message) msg = err.message
        } catch { /* ignore */ }
        alert(msg)
        if (selectedSlot) fetchBookingsForSlot(selectedSlot.id)
        return
      }
      // Apply authoritative server fields (membershipRemaining, membershipId,
      // paymentStatus) so the card reflects the real balance after a deduction.
      const saved = await res.json()
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                paymentType: saved.paymentType ?? b.paymentType,
                paymentStatus: saved.paymentStatus ?? b.paymentStatus,
                membershipId: saved.membershipId ?? null,
                membershipRemaining:
                  typeof saved.membershipRemaining === "number"
                    ? saved.membershipRemaining
                    : b.membershipRemaining,
              }
            : b
        )
      )
    } catch {
      // Network error — resync from server
      if (selectedSlot) fetchBookingsForSlot(selectedSlot.id)
    }
    fetchSalary()
  }

  const handlePaymentMethod = async (booking: Booking, method: string) => {
    const isActive = booking.paymentType === method
    if (isActive) {
      await updateBooking(booking.id, { paymentType: "PENDING", paymentStatus: "UNPAID" })
    } else {
      await updateBooking(booking.id, { paymentType: method, paymentStatus: "PAID" })
    }
  }

  const toggleService = async (booking: Booking, serviceId: string) => {
    const has = booking.services.some((s) => s.service.id === serviceId)
    const svc = services.find((s) => s.id === serviceId)
    // Optimistic local update
    setBookings((prev) => prev.map((b) => {
      if (b.id !== booking.id) return b
      if (has) {
        return { ...b, services: b.services.filter((s) => s.service.id !== serviceId) }
      }
      if (!svc) return b
      // New services default to cash; the trainer can change it below.
      return { ...b, services: [...b.services, { service: { id: svc.id, name: svc.name, price: svc.price }, paymentType: "CASH" }] }
    }))
    try {
      if (has) {
        await fetch(`/api/trainer/bookings/${booking.id}/services?serviceId=${serviceId}`, { method: "DELETE" })
      } else {
        await fetch(`/api/trainer/bookings/${booking.id}/services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceId, paymentType: "CASH" }),
        })
      }
    } catch {
      if (selectedSlot) fetchBookingsForSlot(selectedSlot.id)
    }
  }

  // Set how an already-added extra service was paid (independent of the class
  // payment — e.g. class on a membership, mat in cash).
  const setServicePayment = async (booking: Booking, serviceId: string, method: string) => {
    setBookings((prev) => prev.map((b) => {
      if (b.id !== booking.id) return b
      return {
        ...b,
        services: b.services.map((s) =>
          s.service.id === serviceId ? { ...s, paymentType: method } : s
        ),
      }
    }))
    try {
      await fetch(`/api/trainer/bookings/${booking.id}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, paymentType: method }),
      })
    } catch {
      if (selectedSlot) fetchBookingsForSlot(selectedSlot.id)
    }
  }

  const slotsForDay = (date: string) => slots.filter((s) => s.date === date)

  // Navigation bounds (only Month view is navigable)
  const canPrevMonth = monthAnchor.getTime() > todayStart.getTime()
  const canNextMonth = monthAnchor.getTime() < nextMonthStart.getTime()

  const handlePrev = () => {
    if (view === "month" && canPrevMonth) setMonthAnchor(subMonths(monthAnchor, 1))
  }
  const handleNext = () => {
    if (view === "month" && canNextMonth) setMonthAnchor(addMonths(monthAnchor, 1))
  }

  return (
    <div>
      {/* Compact title — date subtitle moved into day cards, salary moved to top bar */}
      <div className="flex items-center justify-between gap-3 mb-3 lg:mb-4">
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">My Schedule</h1>
        {salary && (
          <Link
            href="/trainer/salary"
            className="hidden lg:block text-right leading-tight hover:opacity-80"
            title="Earnings this month — tap for breakdown"
          >
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">This month</div>
            <div className="text-sm font-semibold text-gray-700">Rp {formatIDR(salary.total)}</div>
          </Link>
        )}
      </div>

      {/* View switcher */}
      <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5 mb-3">
        {(["week", "month"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg text-sm font-medium capitalize",
              view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Navigation — only for month view */}
      {view === "month" && (
        <div className="flex items-stretch gap-2 mb-5">
          <button
            onClick={handlePrev}
            disabled={!canPrevMonth}
            aria-label="Previous month"
            className={cn(
              "flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 active:scale-[0.98]",
              canPrevMonth ? "hover:bg-gray-50" : "opacity-40 cursor-not-allowed"
            )}
          >
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">Previous</span>
          </button>
          <button
            onClick={() => setMonthAnchor(todayStart)}
            className="flex-1 lg:flex-initial px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98]"
          >
            This month
          </button>
          <button
            onClick={handleNext}
            disabled={!canNextMonth}
            aria-label="Next month"
            className={cn(
              "flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 active:scale-[0.98]",
              canNextMonth ? "hover:bg-gray-50" : "opacity-40 cursor-not-allowed"
            )}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Schedule grid — responsive based on view */}
        <div className="flex-1 min-w-0">
          <div className={cn(
            "grid gap-3",
            view === "week"
              ? "grid-cols-1 lg:grid-cols-2"
              : "grid-cols-2 max-lg:landscape:grid-cols-4 lg:grid-cols-7"
          )}>
            {range.days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd")
              const isToday = dateStr === todayStr
              const isOutsideMonth = view === "month" && !isSameMonth(day, monthAnchor)
              const daySlots = slotsForDay(dateStr)

              return (
                <div
                  key={dateStr}
                  ref={isToday && view === "month" ? todayCellRef : null}
                  className={cn(
                    "bg-white rounded-2xl shadow-sm scroll-mt-20",
                    view === "week" ? "p-5" : "p-3 min-h-[180px]",
                    isOutsideMonth && "opacity-40"
                  )}
                >
                  {view === "week" ? (
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <div>
                        <div className={cn(
                          "text-lg font-bold leading-tight",
                          isToday ? "text-[#2C6E49]" : "text-gray-900"
                        )}>
                          {format(day, "EEEE")}
                        </div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {format(day, "MMMM d")}
                        </div>
                      </div>
                      {isToday && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-[#2C6E49] text-white px-2 py-1 rounded-full">Today</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-center mb-3 relative">
                      <div className="uppercase tracking-wide text-gray-400 text-xs">
                        {format(day, "EEEE")}
                      </div>
                      <div className={cn(
                        "font-bold text-lg mt-0.5",
                        isToday ? "text-[#2C6E49]" : "text-gray-800"
                      )}>
                        {format(day, "d")}
                      </div>
                      {isToday && (
                        <span className="block mx-auto mt-1 text-[9px] font-bold uppercase tracking-wider bg-[#2C6E49] text-white px-1.5 py-0.5 rounded-full w-fit">
                          Today
                        </span>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    {daySlots.map((slot) => {
                      // Another trainer's slot — gray "occupied" placeholder, no details
                      if (slot.state === "other") {
                        return (
                          <div
                            key={slot.id}
                            className={cn(
                              "w-full rounded-lg border border-gray-200 bg-gray-50 select-none cursor-default",
                              view === "week" ? "p-3 flex items-center justify-between" : "p-2"
                            )}
                            aria-label="Occupied"
                          >
                            <div className={cn("font-medium text-gray-400", view === "week" ? "text-base" : "text-xs")}>
                              {formatTime(slot.startTime)}
                            </div>
                            <div className={cn("text-gray-300", view === "week" ? "text-xs" : "text-[10px] mt-0.5")}>Occupied</div>
                          </div>
                        )
                      }
                      // Unassigned slot — show bookings count, hint to contact admin
                      if (slot.state === "unassigned") {
                        return (
                          <div
                            key={slot.id}
                            className={cn(
                              "w-full rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 select-none cursor-default",
                              view === "week" ? "p-3" : "p-2"
                            )}
                            title="No trainer assigned — ask the admin to take this session"
                          >
                            <div className={cn("font-semibold text-amber-700", view === "week" ? "text-base" : "text-xs")}>
                              {formatTime(slot.startTime)}
                            </div>
                            <div className={cn("text-amber-600 flex items-center gap-1", view === "week" ? "text-sm mt-1" : "text-[10px] mt-0.5")}>
                              <Users size={view === "week" ? 14 : 10} />
                              {slot._count?.bookings ?? 0}/{slot.maxCapacity ?? 0}
                            </div>
                            <div className={cn("text-amber-700/80 leading-tight", view === "week" ? "text-xs mt-1.5" : "text-[10px] mt-1")}>
                              Free — ask admin
                            </div>
                          </div>
                        )
                      }
                      // Mine — full interactive card
                      const isSelected = selectedSlot?.id === slot.id
                      const hasBookings = (slot._count?.bookings ?? 0) > 0
                      return (
                      <button
                        key={slot.id}
                        onClick={() => handleSlotClick(slot)}
                        className={cn(
                          "w-full text-left rounded-lg border-2 touch-manipulation",
                          view === "week" ? "p-3 flex items-center justify-between gap-2" : "p-2",
                          isSelected
                            ? "bg-[#2C6E49] border-[#2C6E49] text-white"
                            : hasBookings
                            ? "bg-[#2C6E49]/5 border-[#2C6E49]/20 hover:border-[#2C6E49]/50"
                            : "bg-[#ECEDF0] border-gray-300 hover:border-gray-400"
                        )}
                      >
                        <div className={cn(
                          "font-semibold",
                          view === "week" ? "text-base" : "text-xs",
                          isSelected ? "text-white" : hasBookings ? "text-[#2C6E49]" : "text-gray-500"
                        )}>
                          {formatTime(slot.startTime)}
                        </div>
                        <div className={cn(
                          "flex items-center gap-1",
                          view === "week" ? "text-sm" : "text-xs mt-0.5",
                          isSelected ? "text-white/80" : hasBookings ? "text-gray-500" : "text-gray-400"
                        )}>
                          <Users size={view === "week" ? 14 : 10} />
                          {slot._count?.bookings ?? 0}/{slot.maxCapacity ?? 0}
                        </div>
                      </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Booking list for selected slot — full-screen modal on mobile, side panel on desktop */}
        {selectedSlot && (
          <div
            className={cn(
              // Mobile: full-screen modal — overscroll-none stops the whole sheet
              // from rubber-banding as a unit when finger lands on a card
              "fixed inset-0 z-50 bg-[#F5F4F0] flex flex-col overscroll-none",
              // Desktop: side panel, scoped within the parent flex
              "lg:static lg:z-auto lg:inset-auto lg:w-80 lg:bg-white lg:rounded-2xl lg:shadow-sm lg:flex-shrink-0 lg:h-fit lg:p-5 lg:overscroll-auto"
            )}
          >
            {/* Sticky header (mobile) / plain header (desktop) */}
            <div className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100 lg:p-0 lg:border-0 lg:mb-4 lg:bg-transparent flex-shrink-0">
              <div>
                <div className="font-semibold text-gray-800">
                  {format(new Date(selectedSlot.date + "T00:00:00"), "MMM d")} · {formatTime(selectedSlot.startTime)}
                </div>
                <div className="text-sm text-gray-400 mt-0.5">
                  {selectedSlot._count?.bookings ?? 0}/{selectedSlot.maxCapacity ?? 0} booked
                </div>
              </div>
              <button
                onClick={() => setSelectedSlot(null)}
                aria-label="Close"
                className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors lg:w-7 lg:h-7 lg:rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body — overscroll-none kills iOS rubber-band bounce
                so touching a card and pulling down doesn't drag the modal */}
            <div className="flex-1 overflow-y-auto overscroll-none touch-pan-y px-4 py-4 lg:p-0 lg:overflow-visible lg:overscroll-auto">

            {bookings.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-6">No bookings yet</div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b, idx) => {
                  const isPaid = b.paymentStatus === "PAID"
                  const isUpdating = updating === b.id

                  return (
                    <div key={b.id} className="rounded-xl p-4 border-2 border-gray-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          <div className="font-semibold text-gray-900">{b.clientName}</div>
                        </div>
                        {b.checkedIn && <span className="text-[10px] font-medium text-green-700 bg-green-200 px-2 py-0.5 rounded-full">✓ checked in</span>}
                      </div>
                      <div className="ml-8 mb-3">
                        {(() => {
                          const wa = whatsappLink(b.clientPhone, `Hi ${b.clientName.replace(/\s*\(\d+\/\d+\)$/, "")}! Just a friendly reminder about your stretching class today 🌿`)
                          const content = (
                            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#25D366]/8 border border-[#25D366]/20">
                              <WhatsAppIcon size={15} />
                              <span className="text-sm text-gray-800 font-medium">{b.clientPhone}</span>
                            </span>
                          )
                          return wa ? (
                            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-block hover:opacity-90 transition-opacity">
                              {content}
                            </a>
                          ) : content
                        })()}
                      </div>

                      {/* Code verification */}
                      {!b.checkedIn && (
                        <div className="ml-8 mb-3 flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={3}
                            placeholder="000"
                            value={verifyCodes[b.id] ?? ""}
                            onChange={(e) => {
                              const code = e.target.value.replace(/\D/g, "").slice(0, 3)
                              setVerifyCodes((prev) => ({ ...prev, [b.id]: code }))
                              if (verifyStates[b.id]) setVerifyStates((prev) => ({ ...prev, [b.id]: "idle" }))
                              if (code.length === 3) handleVerify(b.id, code)
                            }}
                            className={cn(
                              "w-20 border-2 rounded-lg px-2 py-1.5 text-base font-mono tracking-widest text-center focus:outline-none transition-colors",
                              !verifyStates[b.id] || verifyStates[b.id] === "idle"
                                ? "border-gray-200 bg-white text-gray-700 focus:border-[#2C6E49]"
                                : verifyStates[b.id] === "ok"
                                ? "border-green-400 bg-green-50 text-green-800"
                                : "border-red-400 bg-red-50 text-red-700"
                            )}
                          />
                          {verifyStates[b.id] === "ok" && <span className="text-green-500 text-xl font-bold">✓</span>}
                          {verifyStates[b.id] === "error" && <span className="text-red-400 text-sm">Wrong code</span>}
                          {(!verifyStates[b.id] || verifyStates[b.id] === "idle") && (
                            <span className="text-xs text-gray-400">Client code</span>
                          )}
                        </div>
                      )}

                      {/* Payment method buttons */}
                      <div className="mt-4">
                        <div className="text-xs text-gray-500 font-medium mb-2">Payment method</div>

                        {/* Pay from membership — only when the client has a pass
                            with classes left (or this booking already used one). */}
                        {((b.membershipRemaining ?? 0) > 0 || b.paymentType === "MEMBERSHIP") && (
                          <button
                            type="button"
                            onClick={() => handlePaymentMethod(b, "MEMBERSHIP")}
                            className={cn(
                              "w-full mb-1.5 py-2.5 rounded-lg text-sm font-semibold border touch-manipulation flex items-center justify-center gap-2",
                              b.paymentType === "MEMBERSHIP"
                                ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                                : "bg-[#2C6E49]/5 text-[#2C6E49] border-[#2C6E49]/30 hover:border-[#2C6E49]/60"
                            )}
                          >
                            🎟️
                            {b.paymentType === "MEMBERSHIP"
                              ? `Списано с абонемента · осталось ${b.membershipRemaining ?? 0}`
                              : `Списать с абонемента (${b.membershipRemaining ?? 0} осталось)`}
                          </button>
                        )}

                        <div className="grid grid-cols-4 gap-1.5">
                          {PAYMENT_METHODS.map((pm) => {
                            const isActive = b.paymentType === pm.value
                            return (
                              <button
                                key={pm.value}
                                type="button"
                                onClick={() => handlePaymentMethod(b, pm.value)}
                                className={cn(
                                  "py-2.5 rounded-lg text-sm font-semibold border touch-manipulation",
                                  isActive
                                    ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                                    : "bg-white text-gray-600 border-gray-200 hover:border-[#2C6E49]/40"
                                )}
                              >
                                {pm.label}
                              </button>
                            )
                          })}
                        </div>
                        {isPaid && (
                          <div className="mt-1.5 text-xs text-[#2C6E49] font-medium">
                            ✓ Paid · {b.paymentType}
                          </div>
                        )}
                      </div>

                      {/* Services — bigger tap targets, instant toggle */}
                      {services.length > 0 && (
                        <div className="mt-4">
                          <div className="text-xs text-gray-500 font-medium mb-2">Services</div>
                          <div className="space-y-1.5">
                            {services.map((svc) => {
                              const chosen = b.services.find((s) => s.service.id === svc.id)
                              const hasService = !!chosen
                              return (
                                <div key={svc.id}>
                                  <button
                                    type="button"
                                    onClick={() => toggleService(b, svc.id)}
                                    className={cn(
                                      "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 border text-left touch-manipulation",
                                      hasService
                                        ? "bg-[#2C6E49]/5 border-[#2C6E49]/20"
                                        : "bg-white border-gray-200"
                                    )}
                                  >
                                    <span className={cn(
                                      "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0",
                                      hasService ? "bg-[#2C6E49] border-[#2C6E49]" : "bg-white border-gray-300"
                                    )}>
                                      {hasService && (
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                          <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      )}
                                    </span>
                                    <span className={cn("text-sm flex-1 font-medium", hasService ? "text-gray-900" : "text-gray-700")}>
                                      {svc.name}
                                    </span>
                                    <span className={cn("text-sm font-semibold", hasService ? "text-[#2C6E49]" : "text-gray-400")}>
                                      +{formatIDR(svc.price)}
                                    </span>
                                  </button>
                                  {/* How this extra service was paid — only once added */}
                                  {hasService && (
                                    <div className="mt-1 ml-8 flex gap-1">
                                      {PAYMENT_METHODS.map((pm) => {
                                        const active = (chosen?.paymentType ?? "CASH") === pm.value
                                        return (
                                          <button
                                            key={pm.value}
                                            type="button"
                                            onClick={() => setServicePayment(b, svc.id, pm.value)}
                                            className={cn(
                                              "flex-1 py-1 rounded-md text-[11px] font-semibold border touch-manipulation",
                                              active
                                                ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                                                : "bg-white text-gray-500 border-gray-200"
                                            )}
                                          >
                                            {pm.label}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Total to charge — bigger and prominent */}
                      {(() => {
                        const sessionPrice = selectedSlot?.price ?? 0
                        const servicesTotal = b.services.reduce((sum, s) => sum + s.service.price, 0)
                        const total = sessionPrice + servicesTotal
                        if (total === 0) return null
                        return (
                          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-sm text-gray-500 font-medium">Total to charge</span>
                            <span className="text-lg font-bold text-gray-900">{formatIDR(total)}</span>
                          </div>
                        )
                      })()}

                      {/* Notes — bigger input */}
                      <div className="mt-4">
                        <label className="block text-xs text-gray-500 font-medium mb-2">Notes</label>
                        <input
                          type="text"
                          defaultValue={b.notes ?? ""}
                          disabled={isUpdating}
                          onBlur={(e) => {
                            if (e.target.value !== (b.notes ?? "")) {
                              updateBooking(b.id, { notes: e.target.value })
                            }
                          }}
                          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] disabled:opacity-50"
                          placeholder="Add note..."
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
