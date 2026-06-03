"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth } from "date-fns"
import { ChevronLeft, ChevronRight, Users, X, Pencil, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import SellMembershipButton from "@/app/_components/SellMembershipButton"

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
  // Last change time — used to allow editing a paid booking for 30 minutes.
  updatedAt?: string
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

type View = "2weeks" | "month"

export default function TrainerSchedulePage() {
  // Stable reference — created once per mount so it doesn't re-trigger
  // effects on every render (which caused a visible "blink" / re-scroll
  // in Month view).
  const today = useMemo(() => new Date(), [])
  const todayStart = useMemo(() => startOfMonth(today), [today])
  const nextMonthStart = useMemo(() => startOfMonth(addMonths(today, 1)), [today])

  const [view, setView] = useState<View>("2weeks")
  const [monthAnchor, setMonthAnchor] = useState(startOfMonth(today))
  const todayCellRef = useRef<HTMLDivElement>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  // True while a slot's client list is loading — avoids flashing "No bookings
  // yet" before the data arrives.
  const [loadingBookings, setLoadingBookings] = useState(false)
  // Bookings with an in-flight payment/notes sync → shows a spinner on the
  // active button. A per-booking request counter ignores stale responses so
  // rapid taps (cash → EDC → cash) don't make the buttons blink.
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const reqSeqRef = useRef<Record<string, number>>({})
  const [services, setServices] = useState<Service[]>([])
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [salary, setSalary] = useState<Salary | null>(null)
  // Which paid bookings are collapsed to the one-line "Paid" row. A booking
  // collapses only when the trainer taps "Done" (not the instant they pick a
  // method — that felt jumpy). Already-paid bookings open collapsed; the pencil
  // re-expands them for editing (allowed for 30 min after payment).
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  // When a class just ended with unpaid clients, the cabinet opens straight
  // into that class's payment list and can't be closed until everyone is paid.
  const [forcedSlotId, setForcedSlotId] = useState<string | null>(null)

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
    if (view === "2weeks") {
      // 7 days starting from today (no left/right navigation)
      const days = Array.from({ length: 14 }, (_, i) => addDays(today, i))
      return { start: today, end: addDays(today, 13), days }
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

  // NOTE: Month view intentionally does NOT auto-scroll to today. The grid
  // renders from the 1st and the page stays put (the "Month" toggle doesn't
  // jump); today is still highlighted via todayCellRef styling.

  const fetchBookingsForSlot = useCallback(async (slotId: string) => {
    setLoadingBookings(true)
    try {
      const res = await fetch(`/api/trainer/bookings?slotId=${slotId}`)
      const data: Booking[] = await res.json()
      setBookings(data)
      // Already-paid bookings open collapsed; freshly-paid ones (this session)
      // stay expanded until the trainer taps "Done".
      setCollapsedIds(new Set(data.filter((b) => b.paymentStatus === "PAID").map((b) => b.id)))
    } finally {
      setLoadingBookings(false)
    }
  }, [])

  // On entering the cabinet: if a class just ended with unpaid clients, open
  // straight into its payment list and lock it (can't close until all paid).
  useEffect(() => {
    fetch("/api/trainer/pending-payments")
      .then((r) => (r.ok ? r.json() : { slot: null }))
      .then((d: { slot: Slot | null }) => {
        if (d.slot) {
          setSelectedSlot(d.slot)
          setForcedSlotId(d.slot.id)
          fetchBookingsForSlot(d.slot.id)
        }
      })
      .catch(() => {})
  }, [fetchBookingsForSlot])

  const handleSlotClick = (slot: Slot) => {
    setSelectedSlot(slot)
    fetchBookingsForSlot(slot.id)
  }

  // Optimistic update — apply locally first, then sync to server in the
  // background. This avoids the "blink" of disabled state on every tap.
  const updateBooking = async (id: string, data: Record<string, string>) => {
    // Optimistic: the tapped value shows instantly. A per-booking sequence
    // number lets us ignore responses from superseded taps so the highlight
    // never blinks back through the earlier choices.
    const seq = (reqSeqRef.current[id] = (reqSeqRef.current[id] ?? 0) + 1)
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)))
    setSyncingIds((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/trainer/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const stale = reqSeqRef.current[id] !== seq
      if (!res.ok) {
        if (!stale) {
          // e.g. tried to charge a membership with no balance left — revert.
          let msg = "Couldn't update payment."
          try { const err = await res.json(); if (err?.message) msg = err.message } catch { /* ignore */ }
          alert(msg)
          if (selectedSlot) fetchBookingsForSlot(selectedSlot.id)
        }
        return
      }
      // Only the latest tap applies the authoritative server fields — stale
      // responses are dropped so the optimistic (last-tapped) state stays put.
      if (stale) return
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
      if (reqSeqRef.current[id] === seq && selectedSlot) fetchBookingsForSlot(selectedSlot.id)
    } finally {
      // Clear the spinner / refresh salary only when the LATEST request settles.
      if (reqSeqRef.current[id] === seq) {
        setSyncingIds((prev) => { const n = new Set(prev); n.delete(id); return n })
        fetchSalary()
      }
    }
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
  // How an extra service was paid — only relevant when the session itself is
  // covered by a membership (the pass doesn't cover add-ons, so the trainer
  // picks how the extra was paid: cash / EDC / QR / transfer).
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

  // In the 2-week view, show ONLY the days that have this trainer's own
  // classes ("mine"); empty days are hidden. Month keeps the full calendar.
  const visibleDays = view === "2weeks"
    ? range.days.filter((d) => slotsForDay(format(d, "yyyy-MM-dd")).some((s) => s.state === "mine"))
    : range.days

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
        <div className="flex items-center gap-3">
          <SellMembershipButton />
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
      </div>

      {/* View switcher */}
      <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5 mb-3">
        {(["2weeks", "month"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "flex-1 px-3 py-2 rounded-lg text-sm font-medium",
              view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {v === "2weeks" ? "2 Weeks" : "Month"}
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
          {view === "2weeks" && visibleDays.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400 text-sm">
              No classes scheduled in the next two weeks.
            </div>
          ) : (
          <div className={cn(
            "grid gap-3",
            view === "2weeks"
              ? "grid-cols-1 lg:grid-cols-2"
              : "grid-cols-2 max-lg:landscape:grid-cols-4 lg:grid-cols-7"
          )}>
            {visibleDays.map((day) => {
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
                    view === "2weeks" ? "p-5" : "p-3 min-h-[180px]",
                    isOutsideMonth && "opacity-40"
                  )}
                >
                  {view === "2weeks" ? (
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
                              view === "2weeks" ? "p-3 flex items-center justify-between" : "p-2"
                            )}
                            aria-label="Occupied"
                          >
                            <div className={cn("font-medium text-gray-400", view === "2weeks" ? "text-base" : "text-xs")}>
                              {formatTime(slot.startTime)}
                            </div>
                            <div className={cn("text-gray-300", view === "2weeks" ? "text-xs" : "text-[10px] mt-0.5")}>Occupied</div>
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
                              view === "2weeks" ? "p-3" : "p-2"
                            )}
                            title="No trainer assigned — ask the admin to take this session"
                          >
                            <div className={cn("font-semibold text-amber-700", view === "2weeks" ? "text-base" : "text-xs")}>
                              {formatTime(slot.startTime)}
                            </div>
                            <div className={cn("text-amber-600 flex items-center gap-1", view === "2weeks" ? "text-sm mt-1" : "text-[10px] mt-0.5")}>
                              <Users size={view === "2weeks" ? 14 : 10} />
                              {slot._count?.bookings ?? 0}/{slot.maxCapacity ?? 0}
                            </div>
                            <div className={cn("text-amber-700/80 leading-tight", view === "2weeks" ? "text-xs mt-1.5" : "text-[10px] mt-1")}>
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
                          "w-full text-left rounded-lg border-2 touch-manipulation transition-colors",
                          view === "2weeks" ? "p-3 flex items-center justify-between gap-2" : "p-2",
                          // Class with a booked client → bright (vivid) green.
                          // Class with no bookings yet → pale green.
                          hasBookings
                            ? "bg-[#2C6E49] border-[#2C6E49] text-white"
                            : "bg-[#2C6E49]/8 border-[#2C6E49]/25 hover:border-[#2C6E49]/50",
                          // The currently-open slot gets a ring (keeps the
                          // booked/empty colour meaningful even when selected).
                          isSelected && "ring-2 ring-[#2C6E49] ring-offset-1"
                        )}
                      >
                        <div className={cn(
                          "font-semibold",
                          view === "2weeks" ? "text-base" : "text-xs",
                          hasBookings ? "text-white" : "text-[#2C6E49]"
                        )}>
                          {formatTime(slot.startTime)}
                        </div>
                        <div className={cn(
                          "flex items-center gap-1",
                          view === "2weeks" ? "text-sm" : "text-xs mt-0.5",
                          hasBookings ? "text-white/80" : "text-[#2C6E49]/70"
                        )}>
                          <Users size={view === "2weeks" ? 14 : 10} />
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
          )}
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
              {(() => {
                const forced = forcedSlotId === selectedSlot.id
                const allPaid = bookings.length > 0 && bookings.every((b) => b.paymentStatus === "PAID")
                // Forced (a just-ended class with unpaid clients): no close until
                // every client's payment is set, then a "Done" button releases it.
                if (forced) {
                  return allPaid ? (
                    <button
                      onClick={() => { setForcedSlotId(null); setSelectedSlot(null) }}
                      className="px-4 py-2 rounded-xl bg-[#2C6E49] text-white text-sm font-semibold hover:bg-[#1E4D34] touch-manipulation"
                    >
                      Done
                    </button>
                  ) : (
                    <span className="text-[11px] text-amber-600 font-medium max-w-[150px] text-right leading-tight">
                      Set payment for all clients to continue
                    </span>
                  )
                }
                return (
                  <button
                    onClick={() => setSelectedSlot(null)}
                    aria-label="Close"
                    className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors lg:w-7 lg:h-7 lg:rounded-lg"
                  >
                    <X size={18} />
                  </button>
                )
              })()}
            </div>

            {/* Scrollable body — overscroll-none kills iOS rubber-band bounce
                so touching a card and pulling down doesn't drag the modal */}
            <div className="flex-1 overflow-y-auto overscroll-none touch-pan-y px-4 py-4 lg:p-0 lg:overflow-visible lg:overscroll-auto">

            {loadingBookings ? (
              <div className="flex justify-center py-10" aria-label="Loading">
                <div className="petal-spinner" aria-hidden>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <i key={i} style={{ transform: `rotate(${i * 30}deg)`, animationDelay: `${-(11 - i) / 12}s` }} />
                  ))}
                </div>
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-6">No bookings yet</div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b, idx) => {
                  const isPaid = b.paymentStatus === "PAID"
                  const isUpdating = updating === b.id
                  // Once paid, the card collapses to a single "Paid" line. The
                  // pencil re-opens it for edits until 30 minutes AFTER the
                  // class ends (not 30 min after payment); then it's locked.
                  // Class end parsed in WITA (Bali, UTC+8).
                  const classEndMs = selectedSlot
                    ? Date.parse(`${selectedSlot.date}T${selectedSlot.endTime}:00+08:00`)
                    : NaN
                  const paidWithin30 = Number.isFinite(classEndMs)
                    ? Date.now() < classEndMs + 30 * 60 * 1000
                    : true
                  const collapsed = isPaid && collapsedIds.has(b.id)
                  const paymentLabel = b.paymentType === "MEMBERSHIP"
                    ? "Membership"
                    : (PAYMENT_METHODS.find((p) => p.value === b.paymentType)?.label ?? b.paymentType)

                  if (collapsed) {
                    return (
                      <div key={b.id} className="rounded-xl px-4 py-3 border-2 border-[#2C6E49]/25 bg-[#2C6E49]/5 shadow-sm flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-[#2C6E49]/15 text-[#2C6E49] text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          <span className="font-semibold text-gray-900 truncate">{b.clientName}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-semibold text-[#2C6E49] whitespace-nowrap">✓ Paid · {paymentLabel}</span>
                          {paidWithin30 && (
                            <button
                              type="button"
                              onClick={() => setCollapsedIds((prev) => { const n = new Set(prev); n.delete(b.id); return n })}
                              className="p-1.5 -mr-1 rounded-lg text-gray-400 hover:text-[#2C6E49] hover:bg-[#2C6E49]/10 touch-manipulation"
                              aria-label="Edit payment"
                              title="Edit — available for 30 minutes after payment"
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={b.id} className="rounded-xl p-4 border-2 border-gray-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          <div className="font-semibold text-gray-900">{b.clientName}</div>
                        </div>
                        {b.checkedIn && <span className="text-[10px] font-medium text-green-700 bg-green-200 px-2 py-0.5 rounded-full">✓ checked in</span>}
                      </div>

                      {/* Client phone is intentionally NOT shown to trainers —
                          only the client's name. */}

                      {/* Payment method — one framed group; pick a single option.
                          All options look the same when not selected (neutral
                          white) and turn green only when chosen, so it's clear
                          what to tap. */}
                      <div className="mt-4">
                        <div className="text-xs text-gray-500 font-medium mb-2">Payment method</div>
                        <div className="rounded-xl border border-gray-200 p-2 space-y-1.5">
                          {/* Pay from membership — only when the client has a pass
                              with classes left (or this booking already used one). */}
                          {((b.membershipRemaining ?? 0) > 0 || b.paymentType === "MEMBERSHIP") && (
                            <button
                              type="button"
                              onClick={() => handlePaymentMethod(b, "MEMBERSHIP")}
                              className={cn(
                                "w-full py-2.5 rounded-lg text-sm font-semibold border touch-manipulation flex items-center justify-center gap-2",
                                b.paymentType === "MEMBERSHIP"
                                  ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                                  : "bg-white text-gray-700 border-gray-200 hover:border-[#2C6E49]/40"
                              )}
                            >
                              {b.paymentType === "MEMBERSHIP" && syncingIds.has(b.id) ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <>
                                  🎟️
                                  {b.paymentType === "MEMBERSHIP"
                                    ? `Paid from membership · ${b.membershipRemaining ?? 0} left`
                                    : `Membership (${b.membershipRemaining ?? 0} left)`}
                                </>
                              )}
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
                                    "py-2.5 rounded-lg text-sm font-semibold border touch-manipulation flex items-center justify-center",
                                    isActive
                                      ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                                      : "bg-white text-gray-600 border-gray-200 hover:border-[#2C6E49]/40"
                                  )}
                                >
                                  {isActive && syncingIds.has(b.id)
                                    ? <Loader2 size={15} className="animate-spin" />
                                    : pm.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        {isPaid && (
                          <div className="mt-1.5 text-xs text-[#2C6E49] font-medium">✓ Paid · {paymentLabel}</div>
                        )}
                      </div>

                      {/* Services — framed group; tap to add/remove. The extra's
                          payment is asked per-service ONLY when the session is
                          paid by membership (the pass doesn't cover add-ons). */}
                      {services.length > 0 && (
                        <div className="mt-4">
                          <div className="text-xs text-gray-500 font-medium mb-2">Services</div>
                          <div className="rounded-xl border border-gray-200 p-2 space-y-1.5">
                            {services.map((svc) => {
                              const chosen = b.services.find((s) => s.service.id === svc.id)
                              const hasService = !!chosen
                              // The session is on a pass → the add-on still needs
                              // a money method (cash / EDC / QR / transfer).
                              const askServicePayment = hasService && b.paymentType === "MEMBERSHIP"
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
                                  {askServicePayment && (
                                    <div className="mt-1 ml-8">
                                      <div className="text-[10px] text-gray-400 font-medium mb-1">How is this paid?</div>
                                      <div className="flex gap-1">
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

                      {/* Once a payment method is picked, a clear "Done" button
                          appears — tapping it collapses this client to a compact
                          paid row (so nothing jumps the moment a method is set). */}
                      {isPaid && (
                        <button
                          type="button"
                          onClick={() => setCollapsedIds((prev) => new Set(prev).add(b.id))}
                          className="mt-4 w-full py-3 rounded-xl bg-[#2C6E49] text-white text-sm font-semibold hover:bg-[#1E4D34] touch-manipulation flex items-center justify-center gap-2"
                        >
                          ✓ Done — collapse
                        </button>
                      )}
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
