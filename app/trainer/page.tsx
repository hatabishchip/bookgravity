"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth } from "date-fns"
import { ChevronLeft, ChevronRight, Users, X, Pencil, Loader2, MessageSquare, Bell } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import SellMembershipButton from "@/app/_components/SellMembershipButton"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { ReschedulePicker } from "@/app/_components/ReschedulePicker"
import { useOpenChat } from "@/lib/use-open-chat"
import { formatIDRCompact as formatIDR } from "@/lib/format"
import { baliDateStr } from "@/lib/tz"

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
  // "CONFIRMED" | "NO_SHOW" (CANCELLED never reaches the roster).
  status?: string
  checkedIn: boolean
  notes?: string
  // Last change time — used to allow editing a paid booking for 30 minutes.
  updatedAt?: string
  services: { service: Service; paymentType?: string | null }[]
  slot: { id: string; price?: number }
  // Membership: how many classes the client has left at this studio, and the
  // pass id this booking was charged to (set when paymentType === "MEMBERSHIP").
  membershipRemaining?: number
  membershipId?: string | null
  // Indonesian local resident discount + studio context to gate/price it.
  localResident?: boolean
  studioCountry?: string | null
  localPrice?: number
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

// formatIDR now lives in lib/format (formatIDRCompact) — the local copy
// carried the toFixed(1) bug that rendered 1.35M as "1.4M".

type UnpaidTask = {
  slot: Slot
  unpaidCount: number
  clients: string[]
}

type Handover = {
  id: string
  status: string
  note: string | null
  fromName: string
  toName: string
  slot: { id: string; date: string; startTime: string; endTime: string; classType: string } | null
}

type View = "2weeks" | "month"

// localStorage key holding the per-slot booked count the trainer has already
// "seen". Anything above this baseline is a NEW registration → drives the bell
// badge. Stored so pre-existing bookings never look new and the badge survives
// a page reload.
const SEEN_KEY = "bg:trainer:seenBookings"

export default function TrainerSchedulePage() {
  // Stable reference — created once per mount so it doesn't re-trigger
  // effects on every render (which caused a visible "blink" / re-scroll
  // in Month view).
  const today = useMemo(() => new Date(), [])
  const todayStart = useMemo(() => startOfMonth(today), [today])
  const nextMonthStart = useMemo(() => startOfMonth(addMonths(today, 1)), [today])

  const { openChat } = useOpenChat()
  const [view, setView] = useState<View>("2weeks")
  const [monthAnchor, setMonthAnchor] = useState(startOfMonth(today))
  const todayCellRef = useRef<HTMLDivElement>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  // False until the first schedule fetch resolves — so we show the petal
  // spinner instead of flashing "No classes" on refresh.
  const [slotsLoaded, setSlotsLoaded] = useState(false)
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
  // Transient "Saved" confirmation after a successful payment/notes PATCH —
  // the optimistic UI used to give no feedback at all (audit 2026-06-12).
  const [savedToast, setSavedToast] = useState(0)
  // "New bookings" bell: baseline of already-seen counts (per slot), whether
  // it's been loaded from localStorage yet, and the dropdown open state.
  const [seenCounts, setSeenCounts] = useState<Record<string, number>>({})
  const [seenLoaded, setSeenLoaded] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)

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
    setSlotsLoaded(true)
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
  // Live booking counts: re-fetch the schedule every 20s (and the moment the
  // tab becomes visible again) so the "booked/capacity" numbers update on the
  // trainer's phone in real time without a manual reload. No spinner on these
  // refreshes — slotsLoaded stays true.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") fetchSlots() }
    // 60s (was 30s) to trim Vercel Fluid Active CPU - booking counts don't need
    // 30s freshness; the tab-visible re-fetch still gives an instant update.
    const t = setInterval(tick, 60_000)
    document.addEventListener("visibilitychange", tick)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick) }
  }, [fetchSlots])
  useEffect(() => {
    Promise.all([fetchSalary(), fetchServices()])
  }, [fetchSalary, fetchServices])

  // ── New-bookings bell ──────────────────────────────────────────────────
  // Load the seen baseline once on mount (client-only — guarded for SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEEN_KEY)
      if (raw) setSeenCounts(JSON.parse(raw))
    } catch { /* ignore corrupt/blocked storage */ }
    setSeenLoaded(true)
  }, [])

  const persistSeen = useCallback((next: Record<string, number>) => {
    setSeenCounts(next)
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [])

  // The first time we ever see one of the trainer's upcoming classes, record
  // its current count as the baseline so its already-existing bookings don't
  // show up as "new". Only fills in unseen slots — never overwrites a baseline.
  useEffect(() => {
    if (!seenLoaded || !slotsLoaded) return
    let changed = false
    const next = { ...seenCounts }
    for (const s of slots) {
      if (s.state !== "mine" || s.date < todayStr) continue
      if (!(s.id in next)) { next[s.id] = s._count?.bookings ?? 0; changed = true }
    }
    if (changed) persistSeen(next)
  }, [slots, seenLoaded, slotsLoaded, seenCounts, todayStr, persistSeen])

  // Upcoming classes whose booked count has grown past the seen baseline.
  const newItems = useMemo(() => {
    if (!seenLoaded) return [] as { slot: Slot; delta: number }[]
    return slots
      .filter((s) => s.state === "mine" && s.date >= todayStr)
      .map((s) => {
        const cur = s._count?.bookings ?? 0
        const base = seenCounts[s.id]
        return { slot: s, delta: base === undefined ? 0 : cur - base }
      })
      .filter((x) => x.delta > 0)
      .sort((a, b) =>
        (a.slot.date + a.slot.startTime).localeCompare(b.slot.date + b.slot.startTime)
      )
  }, [slots, seenCounts, seenLoaded, todayStr])

  const newTotal = newItems.reduce((sum, x) => sum + x.delta, 0)

  const markSlotSeen = useCallback((slot: Slot) => {
    persistSeen({ ...seenCounts, [slot.id]: slot._count?.bookings ?? 0 })
  }, [seenCounts, persistSeen])

  const markAllSeen = useCallback(() => {
    const next = { ...seenCounts }
    for (const x of newItems) next[x.slot.id] = x.slot._count?.bookings ?? 0
    persistSeen(next)
  }, [newItems, seenCounts, persistSeen])

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

  // Unpaid clients on ended classes (last 7 days) — open tasks for the bell.
  const [unpaidTasks, setUnpaidTasks] = useState<UnpaidTask[]>([])
  // Class handover requests (incoming = need my decision; outgoing = my offers).
  const [handovers, setHandovers] = useState<{ incoming: Handover[]; outgoing: Handover[] }>({ incoming: [], outgoing: [] })
  const refreshHandovers = useCallback(async () => {
    try {
      const r = await fetch("/api/trainer/handovers")
      if (r.ok) setHandovers(await r.json())
    } catch { /* ignore */ }
  }, [])
  // Hand-over modal: which of my slots is being offered.
  const [handoverFor, setHandoverFor] = useState<Slot | null>(null)
  const refreshPending = useCallback(async (openGate = false) => {
    try {
      const r = await fetch("/api/trainer/pending-payments")
      if (!r.ok) return
      const d: { slot: Slot | null; unpaid?: UnpaidTask[] } = await r.json()
      setUnpaidTasks(d.unpaid ?? [])
      // On entering the cabinet: if a class just ended with unpaid clients,
      // open straight into its payment list as a nudge. Closable — dismissing
      // it keeps the clients counted on the bell until they're settled.
      if (openGate && d.slot) {
        setSelectedSlot(d.slot)
        setForcedSlotId(d.slot.id)
        fetchBookingsForSlot(d.slot.id)
      }
    } catch { /* ignore */ }
  }, [fetchBookingsForSlot])
  useEffect(() => { refreshPending(true); refreshHandovers() }, [refreshPending, refreshHandovers])
  // Poll handovers every 120s (and on tab focus) so the GIVER's outgoing offer
  // flips from "Waiting for reply" to "Accepted" on its own when the colleague
  // accepts - without it the status stayed stale until reload. 120s (was 30s)
  // and handovers-only (pending stays mount/action-driven as before) to keep
  // Vercel Fluid Active CPU down.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") refreshHandovers() }
    const t = setInterval(tick, 120_000)
    document.addEventListener("visibilitychange", tick)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick) }
  }, [refreshHandovers])

  // Bell badge = new registrations + unpaid clients on ended classes (each
  // unpaid client is one open task).
  const unpaidTotal = unpaidTasks.reduce((sum, t) => sum + t.unpaidCount, 0)
  const bellTotal = newTotal + unpaidTotal + handovers.incoming.length


  const handleSlotClick = (slot: Slot) => {
    setSelectedSlot(slot)
    fetchBookingsForSlot(slot.id)
    // Opening a class clears its "new" badge.
    markSlotSeen(slot)
    setBellOpen(false)
  }

  // Move a client to another class. On success the booking belongs to a
  // different slot, so it simply disappears from this class's list on refetch.
  const moveBooking = async (id: string, slotId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/trainer/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId }),
      })
      if (!res.ok) return false
      if (selectedSlot) fetchBookingsForSlot(selectedSlot.id)
      return true
    } catch {
      return false
    }
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
      // Payment state changed → recount the bell's unpaid tasks.
      refreshPending()
      setSavedToast(Date.now())
      setTimeout(() => setSavedToast((t) => (Date.now() - t >= 1400 ? 0 : t)), 1500)
      const saved = await res.json()
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                paymentType: saved.paymentType ?? b.paymentType,
                paymentStatus: saved.paymentStatus ?? b.paymentStatus,
                status: saved.status ?? b.status,
                localResident: saved.localResident ?? b.localResident,
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

  // No-show: client booked but never came. Removes them from the "collect
  // payment" nag; a membership class (if used) stays spent. Reversible.
  const markNoShow = (booking: Booking) => updateBooking(booking.id, { status: "NO_SHOW" })
  const undoNoShow = (booking: Booking) => updateBooking(booking.id, { status: "CONFIRMED" })

  // Local resident (Indonesia only): toggling changes this class's price to the
  // studio's localPrice. Optimistic, then synced.
  const setLocal = async (booking: Booking, val: boolean) => {
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, localResident: val } : b)))
    try {
      await fetch(`/api/trainer/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localResident: val }),
      })
      setSavedToast(Date.now())
      setTimeout(() => setSavedToast((t) => (Date.now() - t >= 1400 ? 0 : t)), 1500)
    } catch {
      if (selectedSlot) fetchBookingsForSlot(selectedSlot.id)
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
            <div className="flex items-center gap-1.5">
              <Link
                href="/trainer/salary"
                className="text-right leading-tight hover:opacity-80"
                title="Earnings this month - tap for breakdown"
              >
                <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">This month</div>
                <div className="text-sm font-semibold text-gray-700">Rp {formatIDR(salary.total)}</div>
              </Link>
              {/* Tiny notification bell next to the salary block. Badge counts
                  clients who registered since the trainer last looked. The
                  popover modal is centered on screen (not pinned to the bell)
                  so it doesn't run off the top edge on small screens. */}
              <button
                type="button"
                onClick={() => { setBellOpen(true); refreshPending(); refreshHandovers() }}
                aria-label="Notifications"
                title="Notifications"
                className={cn(
                  "relative w-7 h-7 flex items-center justify-center rounded-full touch-manipulation transition-colors shrink-0",
                  bellTotal > 0
                    ? "text-brand hover:bg-brand/10"
                    : "text-gray-400 hover:bg-gray-100"
                )}
              >
                <Bell size={16} strokeWidth={2.25} />
                {bellTotal > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm leading-none">
                    {bellTotal > 9 ? "9+" : bellTotal}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New-bookings modal — centered on screen, not anchored to the bell.
          Mirrors SellMembershipButton's pattern (full-screen on mobile, centered
          card on ≥sm). Closes on backdrop click / × button. */}
      {bellOpen && (
        <div
          className="fixed inset-0 z-50 bg-white sm:bg-black/40 sm:flex sm:items-center sm:justify-center sm:p-4"
          onClick={() => setBellOpen(false)}
        >
          <div
            className="bg-white shadow-xl flex flex-col absolute inset-0 sm:static sm:inset-auto sm:w-full sm:max-w-sm sm:max-h-[80vh] sm:rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Notifications</h3>
              <div className="flex items-center gap-3">
                {newTotal > 0 && (
                  <button
                    type="button"
                    onClick={markAllSeen}
                    className="text-xs text-brand font-medium hover:underline"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBellOpen(false)}
                  aria-label="Close"
                  className="text-gray-400 text-xl leading-none p-1"
                >
                  ×
                </button>
              </div>
            </div>
            {/* Class handover requests — colleague asks me to take a class. */}
            {handovers.incoming.length > 0 && (
              <div className="flex-shrink-0 border-b border-gray-100">
                <div className="px-5 pt-3 pb-1 text-[11px] font-semibold text-brand uppercase tracking-wide">
                  Take a class? · {handovers.incoming.length}
                </div>
                <div className="divide-y divide-gray-50">
                  {handovers.incoming.map((h) => (
                    <div key={h.id} className="px-5 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {h.fromName} asks you to take{" "}
                        {h.slot ? `${format(new Date(h.slot.date + "T00:00:00"), "EEE, MMM d")} · ${formatTime(h.slot.startTime)}` : "a class"}
                      </div>
                      {h.note && <div className="text-xs text-gray-500 mt-0.5">“{h.note}”</div>}
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await fetch(`/api/trainer/handovers/${h.id}`, {
                              method: "PATCH", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "accept" }),
                            })
                            if (!r.ok) alert((await r.json().catch(() => ({})))?.error || "Couldn't accept")
                            refreshHandovers(); fetchSlots()
                          }}
                          className="flex-1 py-2 rounded-lg bg-brand text-white text-xs font-semibold touch-manipulation"
                        >
                          Accept class
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/trainer/handovers/${h.id}`, {
                              method: "PATCH", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "decline" }),
                            })
                            refreshHandovers()
                          }}
                          className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold touch-manipulation"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* My outgoing offers — pending (cancellable) and recent outcomes. */}
            {handovers.outgoing.length > 0 && (
              <div className="flex-shrink-0 border-b border-gray-100">
                <div className="px-5 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  My handover offers
                </div>
                <div className="divide-y divide-gray-50">
                  {handovers.outgoing.map((h) => (
                    <div key={h.id} className="px-5 py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-gray-700 truncate">
                          {h.slot ? `${format(new Date(h.slot.date + "T00:00:00"), "MMM d")} · ${formatTime(h.slot.startTime)}` : "Class"} → {h.toName}
                        </div>
                        <div className={cn("text-[11px] font-semibold",
                          h.status === "PENDING" ? "text-amber-600" : h.status === "ACCEPTED" ? "text-brand" : "text-gray-400")}>
                          {h.status === "PENDING" ? "Waiting for reply" : h.status === "ACCEPTED" ? "Accepted ✓" : "Declined"}
                        </div>
                      </div>
                      {h.status === "PENDING" && (
                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/trainer/handovers/${h.id}`, {
                              method: "PATCH", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "cancel" }),
                            })
                            refreshHandovers()
                          }}
                          className="text-xs text-gray-400 hover:text-red-500 underline whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Open payment tasks — every unpaid client on an ended class.
                Tapping a class opens its payment list. */}
            {unpaidTasks.length > 0 && (
              <div className="flex-shrink-0 border-b border-gray-100">
                <div className="px-5 pt-3 pb-1 text-[11px] font-semibold text-amber-600 uppercase tracking-wide">
                  Collect payments · {unpaidTotal}
                </div>
                <div className="divide-y divide-gray-50">
                  {unpaidTasks.map((t) => (
                    <button
                      key={t.slot.id}
                      type="button"
                      onClick={() => handleSlotClick(t.slot)}
                      className="w-full text-left px-5 py-3 hover:bg-amber-50/60 flex items-center justify-between gap-2 touch-manipulation"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {format(new Date(t.slot.date + "T00:00:00"), "EEE, MMM d")} · {formatTime(t.slot.startTime)}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{t.clients.join(", ")}</div>
                      </div>
                      <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold flex items-center justify-center">
                        {t.unpaidCount}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {newItems.length === 0 && unpaidTasks.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-gray-400">
                Nothing needs your attention
              </div>
            ) : newItems.length === 0 ? null : (
              <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                {newItems.map(({ slot, delta }) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => handleSlotClick(slot)}
                    className="w-full text-left px-5 py-3 hover:bg-gray-50 flex items-center justify-between gap-2 touch-manipulation"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {format(new Date(slot.date + "T00:00:00"), "EEE, MMM d")}
                      </div>
                      <div className="text-xs text-gray-500">{formatTime(slot.startTime)}</div>
                    </div>
                    <span className="flex-shrink-0 text-xs font-bold text-white bg-brand rounded-full px-2 py-1">
                      +{delta}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
          {!slotsLoaded ? (
            <div className="bg-white rounded-2xl shadow-sm"><PetalSpinner /></div>
          ) : view === "2weeks" && visibleDays.length === 0 ? (
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
                          isToday ? "text-brand" : "text-gray-900"
                        )}>
                          {format(day, "EEEE")}
                        </div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {format(day, "MMMM d")}
                        </div>
                      </div>
                      {isToday && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-brand text-white px-2 py-1 rounded-full">Today</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-center mb-3 relative">
                      <div className="uppercase tracking-wide text-gray-400 text-xs">
                        {format(day, "EEEE")}
                      </div>
                      <div className={cn(
                        "font-bold text-lg mt-0.5",
                        isToday ? "text-brand" : "text-gray-800"
                      )}>
                        {format(day, "d")}
                      </div>
                      {isToday && (
                        <span className="block mx-auto mt-1 text-[9px] font-bold uppercase tracking-wider bg-brand text-white px-1.5 py-0.5 rounded-full w-fit">
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
                            title="No trainer assigned - ask the admin to take this session"
                          >
                            <div className={cn("font-semibold text-amber-700", view === "2weeks" ? "text-base" : "text-xs")}>
                              {formatTime(slot.startTime)}
                            </div>
                            <div className={cn("text-amber-600 flex items-center gap-1", view === "2weeks" ? "text-sm mt-1" : "text-[10px] mt-0.5")}>
                              <Users size={view === "2weeks" ? 14 : 10} />
                              {slot._count?.bookings ?? 0}/{slot.maxCapacity ?? 0}
                            </div>
                            <div className={cn("text-amber-700/80 leading-tight", view === "2weeks" ? "text-xs mt-1.5" : "text-[10px] mt-1")}>
                              Free - ask admin
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
                            ? "bg-brand border-brand text-white"
                            : "bg-brand/8 border-brand/25 hover:border-brand/50",
                          // The currently-open slot gets a ring (keeps the
                          // booked/empty colour meaningful even when selected).
                          isSelected && "ring-2 ring-brand ring-offset-1"
                        )}
                      >
                        <div className={cn(
                          "font-semibold",
                          view === "2weeks" ? "text-base" : "text-xs",
                          hasBookings ? "text-white" : "text-brand"
                        )}>
                          {formatTime(slot.startTime)}
                        </div>
                        <div className={cn(
                          "flex items-center gap-1",
                          view === "2weeks" ? "text-sm" : "text-xs mt-0.5",
                          hasBookings ? "text-white/80" : "text-brand/70"
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
              "fixed inset-0 z-50 bg-sand flex flex-col overscroll-none",
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
                {/* Hand the whole class to a colleague (give-initiated only).
                    Future classes only — the past is salary history. */}
                {selectedSlot.date >= baliDateStr(new Date()) && (
                  <button
                    type="button"
                    onClick={() => setHandoverFor(selectedSlot)}
                    className="mt-1 text-xs font-medium text-brand hover:text-brand-dark underline touch-manipulation"
                  >
                    Hand over to a colleague
                  </button>
                )}
              </div>
              {(() => {
                const forced = forcedSlotId === selectedSlot.id
                const allPaid = bookings.length > 0 && bookings.every((b) => b.paymentStatus === "PAID")
                // Forced (a just-ended class with unpaid clients): no close until
                // every client's payment is set, then a "Done" button releases it.
                if (forced) {
                  // Closable since 2026-06-12: the ✕ dismisses the nudge, and
                  // every still-unpaid client stays counted on the bell as an
                  // open task — nothing is silently forgotten.
                  return allPaid ? (
                    <button
                      onClick={() => { setForcedSlotId(null); setSelectedSlot(null) }}
                      className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark touch-manipulation"
                    >
                      Done
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-amber-600 font-medium max-w-[130px] text-right leading-tight">
                        Unpaid clients stay on the bell
                      </span>
                      <button
                        onClick={() => { setForcedSlotId(null); setSelectedSlot(null); refreshPending() }}
                        aria-label="Close"
                        className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors lg:w-7 lg:h-7 lg:rounded-lg"
                      >
                        <X size={18} />
                      </button>
                    </div>
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

                  // No-show: a compact greyed row with one-tap undo. No payment
                  // is asked and it's out of the bell's "collect payment" list.
                  if (b.status === "NO_SHOW") {
                    return (
                      <div key={b.id} className="rounded-xl px-4 py-3 border-2 border-gray-200 bg-gray-50 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-400 text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          <span className="font-medium text-gray-400 line-through truncate">{b.clientName}</span>
                          <span className="text-[10px] font-semibold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full flex-shrink-0">No-show</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => undoNoShow(b)}
                          className="text-xs font-semibold text-gray-500 hover:text-brand underline touch-manipulation flex-shrink-0"
                        >
                          Undo
                        </button>
                      </div>
                    )
                  }

                  if (collapsed) {
                    return (
                      <div key={b.id} className="rounded-xl px-4 py-3 border-2 border-brand/25 bg-brand/5 shadow-sm flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-brand/15 text-brand text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          <span className="font-semibold text-gray-900 truncate">{b.clientName}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-semibold text-brand whitespace-nowrap">✓ Paid · {paymentLabel}</span>
                          <button
                            type="button"
                            onClick={() => openChat(b.clientPhone, b.clientName)}
                            title="Написать клиенту"
                            aria-label="Написать клиенту"
                            className="p-1.5 rounded-lg text-brand hover:bg-brand/10 touch-manipulation"
                          >
                            <MessageSquare size={16} strokeWidth={2.25} />
                          </button>
                          {paidWithin30 && (
                            <button
                              type="button"
                              onClick={() => setCollapsedIds((prev) => { const n = new Set(prev); n.delete(b.id); return n })}
                              className="p-1.5 -mr-1 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10 touch-manipulation"
                              aria-label="Edit payment"
                              title="Edit - available for 30 minutes after payment"
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
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {b.checkedIn && <span className="text-[10px] font-medium text-green-700 bg-green-200 px-2 py-0.5 rounded-full">✓ checked in</span>}
                          {/* Message this client in the in-app chat. */}
                          <button
                            type="button"
                            onClick={() => openChat(b.clientPhone, b.clientName)}
                            title="Написать клиенту"
                            aria-label="Написать клиенту"
                            className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand/10 text-brand hover:bg-brand/15 active:scale-95 transition touch-manipulation"
                          >
                            <MessageSquare size={17} strokeWidth={2.25} />
                          </button>
                        </div>
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
                                  ? "bg-brand text-white border-brand"
                                  : "bg-white text-gray-700 border-gray-200 hover:border-brand/40"
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
                                      ? "bg-brand text-white border-brand"
                                      : "bg-white text-gray-600 border-gray-200 hover:border-brand/40"
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
                        {/* Local resident (Indonesia only): a discounted class
                            price for an Indonesian local. */}
                        {b.studioCountry === "ID" && (
                          <button
                            type="button"
                            onClick={() => setLocal(b, !b.localResident)}
                            className={cn(
                              "mt-2 w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left touch-manipulation",
                              b.localResident ? "bg-brand/5 border-brand/20" : "bg-white border-gray-200 hover:border-brand/40"
                            )}
                          >
                            <span className={cn("w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0", b.localResident ? "bg-brand border-brand" : "bg-white border-gray-300")}>
                              {b.localResident && (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span className="text-sm font-medium text-gray-700 flex-1">Local (Indonesian resident)</span>
                            <span className="text-xs font-semibold text-brand">{formatIDR(b.localPrice ?? 200000)}</span>
                          </button>
                        )}
                        {isPaid && (
                          <div className="mt-1.5 text-xs text-brand font-medium">✓ Paid · {paymentLabel}{b.localResident ? " · Local" : ""}</div>
                        )}
                        {/* Didn't come? Mark no-show instead of chasing a
                            payment. A used membership class stays spent. */}
                        {!isPaid && (
                          <button
                            type="button"
                            onClick={() => markNoShow(b)}
                            className="mt-2 text-xs font-medium text-gray-400 hover:text-gray-600 underline touch-manipulation"
                          >
                            Mark as no-show
                          </button>
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
                                        ? "bg-brand/5 border-brand/20"
                                        : "bg-white border-gray-200"
                                    )}
                                  >
                                    <span className={cn(
                                      "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0",
                                      hasService ? "bg-brand border-brand" : "bg-white border-gray-300"
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
                                    <span className={cn("text-sm font-semibold", hasService ? "text-brand" : "text-gray-400")}>
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
                                                  ? "bg-brand text-white border-brand"
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
                          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand disabled:opacity-50"
                          placeholder="Add note..."
                        />
                      </div>

                      {/* Reschedule — same picker as All My Bookings, so trainers
                          who live on this page (Dita/Seni) can move a client too. */}
                      <div className="mt-3">
                        <ReschedulePicker
                          excludeSlotId={b.slot.id}
                          onMove={(slotId) => moveBooking(b.id, slotId)}
                        />
                      </div>

                      {/* Once a payment method is picked, a clear "Done" button
                          appears — tapping it collapses this client to a compact
                          paid row (so nothing jumps the moment a method is set). */}
                      {isPaid && (
                        <button
                          type="button"
                          onClick={() => setCollapsedIds((prev) => new Set(prev).add(b.id))}
                          className="mt-4 w-full py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark touch-manipulation flex items-center justify-center gap-2"
                        >
                          ✓ Done - collapse
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

      {/* Hand-over modal: pick a colleague, optional note, send the offer. */}
      {handoverFor && (
        <HandoverModal
          slot={handoverFor}
          onClose={() => setHandoverFor(null)}
          onSent={() => { setHandoverFor(null); refreshHandovers() }}
        />
      )}

      {/* WhatsApp-style transient confirmation for payment/notes saves. */}
      {savedToast > 0 && (
        <div className="pointer-events-none fixed left-1/2 bottom-24 -translate-x-1/2 z-[60] flex items-center gap-1.5 rounded-full bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
          ✓ Saved
        </div>
      )}
    </div>
  )
}


// Pick-a-colleague modal for the class handover (give-initiated). Kept tiny:
// list of active colleagues + optional note + one POST.
function HandoverModal({ slot, onClose, onSent }: { slot: Slot; onClose: () => void; onSent: () => void }) {
  const [colleagues, setColleagues] = useState<{ id: string; name: string; color?: string | null }[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/trainer/colleagues")
      .then((r) => (r.ok ? r.json() : []))
      .then(setColleagues)
      .catch(() => setColleagues([]))
  }, [])

  const send = async () => {
    if (!picked) return
    setSending(true)
    setError(null)
    try {
      const r = await fetch("/api/trainer/handovers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, toTrainerId: picked, note: note.trim() || undefined }),
      })
      if (!r.ok) {
        setError((await r.json().catch(() => ({})))?.error || "Couldn't send the offer")
        setSending(false)
        return
      }
      onSent()
    } catch {
      setError("Couldn't send the offer - try again")
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900">Hand over this class</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {format(new Date(slot.date + "T00:00:00"), "EEE, MMM d")} · {formatTime(slot.startTime)}. Pick the right
          colleague below, then send. They get a request and must tap Accept in their bell - until then it shows as
          pending and the class stays yours.
        </p>

        <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
          {colleagues === null ? (
            <div className="text-sm text-gray-400 py-2">Loading…</div>
          ) : colleagues.length === 0 ? (
            <div className="text-sm text-gray-400 py-2">No other trainers in this studio.</div>
          ) : (
            colleagues.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setPicked(picked === c.id ? null : c.id)}
                className={cn(
                  "w-full px-3 py-2.5 rounded-lg border text-left text-sm font-medium touch-manipulation",
                  picked === c.id ? "bg-brand text-white border-brand" : "bg-white text-gray-700 border-gray-200 hover:border-brand/40"
                )}
              >
                {c.name}
              </button>
            ))
          )}
        </div>

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional) - e.g. “I'm sick, can you cover?”"
          maxLength={300}
          className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />

        {error && <div className="mt-2 text-xs text-red-500">{error}</div>}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold touch-manipulation">
            Back
          </button>
          <button
            type="button"
            disabled={!picked || sending}
            onClick={send}
            className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold disabled:opacity-50 touch-manipulation"
          >
            {sending ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  )
}
