"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  format, addDays, startOfWeek, endOfWeek, addWeeks, subWeeks,
  startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth,
} from "date-fns"
import { ChevronLeft, ChevronRight, X, Check, Plus, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { ClientBookingRow } from "@/app/_components/ClientBookingRow"
import { useOpenChat } from "@/lib/use-open-chat"

type View = "week" | "2weeks" | "month"

type Trainer = {
  id: string
  name: string
  color: string
  commissionRate: number
  user: { email: string }
}

type Slot = {
  id: string
  date: string
  startTime: string
  endTime: string
  maxCapacity: number
  price: number
  trainer: { id: string; name: string; color: string } | null
  _count: { bookings: number }
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function computeEndTime(startTime: string) {
  const [h, m] = startTime.split(":").map(Number)
  const endMin = h * 60 + m + 120
  return `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`
}

const VIEW_LABELS: Record<View, string> = { week: "Week", "2weeks": "2 Weeks", month: "Month" }
const TIME_PRESETS = ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00"]
const todayStr = format(new Date(), "yyyy-MM-dd")

const EMPTY_CREATE = {
  date: format(new Date(), "yyyy-MM-dd"),
  startTimes: [] as string[],
  customTime: "10:00",
  maxCapacity: 6,
  price: 300000,
}

function sortTimes(times: string[]) {
  return [...new Set(times)].sort()
}

export default function TrainerSchedule({
  trainer,
  onClose,
}: {
  trainer: Trainer
  onClose: () => void
}) {
  const [view, setView] = useState<View>("month")
  const [anchor, setAnchor] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [slots, setSlots] = useState<Slot[]>([])
  // False until the first slots fetch resolves — show the petal spinner
  // instead of a blank, seemingly-frozen grid.
  const [slotsLoaded, setSlotsLoaded] = useState(false)

  // Create modal
  const [createModal, setCreateModal] = useState<string | null>(null) // date string
  // Which slot's client list is open (the "people" button popup).
  const [clientsSlot, setClientsSlot] = useState<Slot | null>(null)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  // Lock body scroll while this view (or its create modal) is open — iOS-safe
  useBodyScrollLock(true)

  const days = useMemo(() => {
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(anchor, i))
    if (view === "2weeks") return Array.from({ length: 14 }, (_, i) => addDays(anchor, i))
    // Month view: full calendar grid so weekday columns line up with the
    // MON/TUE/… headers (pad the start with previous month, end with next).
    const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    const result: Date[] = []
    let d = gridStart
    while (d <= gridEnd) { result.push(d); d = addDays(d, 1) }
    return result
  }, [view, anchor])

  const from = format(days[0], "yyyy-MM-dd")
  const to = format(days[days.length - 1], "yyyy-MM-dd")

  const headerLabel = useMemo(() => {
    if (view === "month") return format(anchor, "MMMM yyyy")
    return `${format(days[0], "MMMM d")} – ${format(days[days.length - 1], "MMMM d, yyyy")}`
  }, [view, anchor, days])

  const fetchSlots = useCallback(async () => {
    const res = await fetch(`/api/admin/slots?from=${from}&to=${to}`)
    setSlots(await res.json())
    setSlotsLoaded(true)
  }, [from, to])

  useEffect(() => { fetchSlots() }, [fetchSlots])

  // Esc closes the overlay (desktop keyboards) — another way back out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const handlePrev = () => {
    if (view === "month") setAnchor(subMonths(startOfMonth(anchor), 1))
    else if (view === "2weeks") setAnchor(subWeeks(anchor, 2))
    else setAnchor(subWeeks(anchor, 1))
  }

  const handleNext = () => {
    if (view === "month") setAnchor(addMonths(startOfMonth(anchor), 1))
    else if (view === "2weeks") setAnchor(addWeeks(anchor, 2))
    else setAnchor(addWeeks(anchor, 1))
  }

  // Toggle assignment — no confirm dialog, instant action
  const handleToggle = async (slot: Slot) => {
    const isMine = slot.trainer?.id === trainer.id
    // Optimistic update — flip trainer locally in the same frame
    setSlots((prev) => prev.map((s) =>
      s.id === slot.id
        ? { ...s, trainer: isMine ? null : { id: trainer.id, name: trainer.name, color: trainer.color } }
        : s
    ))
    try {
      await fetch(`/api/admin/slots?id=${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainerId: isMine ? null : trainer.id,
        }),
      })
    } catch {
      fetchSlots()
    }
  }

  // Create new slot pre-assigned to this trainer
  const openCreate = (date: string) => {
    setCreateForm({ ...EMPTY_CREATE, date })
    setCreateError("")
    setCreateModal(date)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (createForm.startTimes.length === 0) {
      setCreateError("Select at least one time")
      return
    }
    setCreating(true)
    setCreateError("")

    const failed: string[] = []
    for (const startTime of createForm.startTimes) {
      const res = await fetch("/api/admin/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: createForm.date,
          startTime,
          trainerId: trainer.id,
          maxCapacity: Number(createForm.maxCapacity),
          price: Number(createForm.price),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        failed.push(`${startTime}: ${err.error ?? "error"}`)
      }
    }

    await fetchSlots()
    setCreating(false)
    if (failed.length > 0) {
      setCreateError(`Some slots not created — ${failed.join("; ")}`)
      return
    }
    setCreateModal(null)
  }

  const slotsForDay = (date: string) => slots.filter((s) => s.date === date)
  const mySlots = slots.filter((s) => s.trainer?.id === trainer.id).length
  const cellMinH = view === "week" ? "min-h-[200px]" : "min-h-[140px]"
  const cellPad = "p-2.5"

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex">
      {/* Always-visible close button (mobile/tablet) — pinned to the viewport
          so it never scrolls away with the (long) month grid. The reliable
          way back to the Trainers list. On desktop the header X + the
          tap-outside backdrop already cover this. */}
      <button
        onClick={onClose}
        aria-label="Close schedule"
        className="lg:hidden fixed top-3 right-3 z-[55] flex items-center justify-center w-11 h-11 rounded-full bg-white text-gray-700 shadow-lg ring-1 ring-black/10 hover:bg-gray-100 active:scale-95 transition"
      >
        <X size={22} />
      </button>

      <div className="hidden lg:block flex-1" onClick={onClose} />

      <div className="w-full max-w-5xl bg-gray-50 h-full overflow-y-auto flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sticky top-0 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2 truncate">
                <span
                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: trainer.color }}
                />
                {trainer.name}'s Schedule
              </h2>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                {headerLabel} · {mySlots} sessions
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
              {(["week", "2weeks", "month"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "flex-1 lg:flex-initial px-3 py-2 rounded-lg text-xs sm:text-sm font-medium",
                    view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-stretch gap-2">
              <button
                onClick={handlePrev}
                aria-label="Previous"
                className="flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
              >
                <ChevronLeft size={18} />
                <span className="hidden sm:inline">Previous</span>
              </button>
              <button
                onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="flex-1 lg:flex-initial px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
              >
                Today
              </button>
              <button
                onClick={handleNext}
                aria-label="Next"
                className="flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Desktop close — hidden on mobile/tablet where the floating
                fixed X handles it. */}
            <button onClick={onClose} aria-label="Close schedule" className="hidden lg:flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 ml-1 flex-shrink-0">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-2 hidden md:flex items-center gap-5 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-brand flex items-center justify-center">
              <Check size={8} className="text-white" strokeWidth={3} />
            </span>
            Assigned — click to remove
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border border-gray-300 bg-white" />
            Not assigned — click to assign
          </span>
          <span className="flex items-center gap-1.5">
            <Plus size={11} className="text-brand" />
            Click empty day to add new session
          </span>
        </div>

        {/* Calendar */}
        <div className="px-2 sm:px-6 pb-6 flex-1">
          {!slotsLoaded && <PetalSpinner className="py-20" />}
          {/* Day headers — only on desktop */}
          <div className={cn("hidden lg:grid grid-cols-7 gap-2 mb-1.5", !slotsLoaded && "lg:hidden")}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 uppercase tracking-wide py-1">
                {d}
              </div>
            ))}
          </div>

          <div className={cn("grid grid-cols-2 max-lg:landscape:grid-cols-4 lg:grid-cols-7 gap-2", !slotsLoaded && "hidden")}>
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd")
              const isToday = dateStr === todayStr
              const isOutsideMonth = view === "month" && !isSameMonth(day, anchor)
              const daySlots = slotsForDay(dateStr)

              return (
                <div
                  key={dateStr}
                  onClick={() => openCreate(dateStr)}
                  className={cn(
                    "bg-white rounded-2xl shadow-sm cursor-pointer group",
                    "hover:ring-1 hover:ring-gray-300",
                    cellPad, cellMinH,
                    isOutsideMonth && "opacity-40",
                  )}
                >
                  {/* Date number */}
                  <div className="text-center mb-2">
                    <div className="lg:hidden text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      {format(day, "EEE")}
                    </div>
                    <div className={cn(
                      "font-bold mx-auto flex items-center justify-center rounded-full text-lg w-8 h-8 mt-0.5",
                      isToday ? "bg-gray-800 text-white" : "text-gray-800"
                    )}>
                      {format(day, "d")}
                    </div>
                  </div>

                  {/* Slots */}
                  <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                    {daySlots.map((slot) => {
                      const isMine = slot.trainer?.id === trainer.id
                      const hasBookings = slot._count.bookings > 0
                      const otherColor = slot.trainer && !isMine ? slot.trainer.color : null

                      // Bright solid fill ONLY when this is the selected trainer's
                      // class AND it has at least one booked client. An empty class
                      // of theirs shows a faint tint, like other trainers' classes.
                      const mineBright = isMine && hasBookings
                      const faintColor = isMine ? trainer.color : otherColor

                      const cellStyle = mineBright
                        ? { backgroundColor: trainer.color, borderColor: trainer.color }
                        : faintColor
                          ? { backgroundColor: hexToRgba(faintColor, 0.12), borderColor: hexToRgba(faintColor, 0.4) }
                          : {}

                      return (
                        <button
                          key={slot.id}
                          onClick={() => handleToggle(slot)}
                          style={cellStyle}
                          className={cn(
                            "w-full text-left rounded-lg border p-1.5 touch-manipulation",
                            // Unassigned slot: theme-aware utilities (not a hardcoded light hex)
            // so the dark remap keeps it a dark, readable card.
            !mineBright && !faintColor && "bg-gray-100 border-gray-200 hover:border-gray-300 hover:bg-gray-200"
                          )}
                        >
                          <div className="flex items-start gap-1">
                            {/* Checkbox */}
                            <span className={cn(
                              "flex-shrink-0 mt-0.5 rounded-sm border flex items-center justify-center transition-colors w-3.5 h-3.5",
                              mineBright ? "bg-white border-white" : "border-gray-300 bg-white"
                            )}>
                              {isMine && <Check size={9} strokeWidth={3} style={{ color: trainer.color }} />}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div
                                className={cn(
                                  "font-semibold leading-tight truncate text-xs",
                                  mineBright ? "text-white" : "text-gray-700"
                                )}
                                style={!mineBright && faintColor ? { color: faintColor } : {}}
                              >
                                {formatTime(slot.startTime)}
                              </div>
                              <div
                                className={cn(
                                  "text-[10px] truncate mt-0.5",
                                  mineBright ? "text-white/70" : "text-gray-400"
                                )}
                                style={!mineBright && faintColor ? { color: hexToRgba(faintColor, 0.85) } : {}}
                              >
                                {slot.trainer ? slot.trainer.name : "Unassigned"}
                              </div>
                              {slot._count.bookings > 0 ? (
                                // Tappable people-count: opens the client list
                                // (Move / Cancel) without toggling assignment.
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); setClientsSlot(slot) }}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setClientsSlot(slot) } }}
                                  title="Показать клиентов"
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[10px] font-medium rounded px-1 -ml-1 py-0.5 cursor-pointer underline decoration-dotted underline-offset-2",
                                    mineBright ? "text-white/90 hover:bg-white/15" : "text-gray-500 hover:bg-black/5"
                                  )}
                                  style={!mineBright && faintColor ? { color: hexToRgba(faintColor, 0.85) } : {}}
                                >
                                  <Users size={10} />
                                  {slot._count.bookings}/{slot.maxCapacity}
                                </span>
                              ) : (
                                <div
                                  className={cn(
                                    "text-[10px]",
                                    mineBright ? "text-white/60" : "text-gray-400"
                                  )}
                                  style={!mineBright && faintColor ? { color: hexToRgba(faintColor, 0.7) } : {}}
                                >
                                  {slot._count.bookings}/{slot.maxCapacity}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Add hint on hover */}
                  <div className="mt-1 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity py-1">
                    <Plus size={10} className="text-gray-300" />
                    <span className="text-[10px] text-gray-300">add</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Create session modal */}
      {createModal !== null && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4 touch-none"
          onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault() }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-shrink-0 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Add Session</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {format(new Date(createForm.date + "T00:00:00"), "EEEE, MMMM d")} · <span className="text-brand font-medium">{trainer.name}</span>
                </p>
              </div>
              <button onClick={() => setCreateModal(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex-1 flex flex-col overflow-hidden min-w-0">
              <div className="px-6 py-4 space-y-4 overflow-y-auto overflow-x-hidden flex-1 overscroll-contain">

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session times</label>
                <p className="text-xs text-gray-400 mb-2">Pick one or more — each creates a separate session (+120 min)</p>
                {/* Multi-select presets. Times that already have a class on this
                    day are filled solid green (same as the Schedule / Schedule
                    Beta views) and locked — you can't double-book them. */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(() => {
                    const existingTimes = new Set(slotsForDay(createForm.date).map((s) => s.startTime))
                    return TIME_PRESETS.map((t) => {
                      const selected = createForm.startTimes.includes(t)
                      const taken = existingTimes.has(t)
                      return (
                        <button key={t} type="button"
                          disabled={taken}
                          title={taken ? "A class already exists at this time" : undefined}
                          onClick={() => {
                            if (taken) return
                            const next = selected ? createForm.startTimes.filter((x) => x !== t) : sortTimes([...createForm.startTimes, t])
                            setCreateForm({ ...createForm, startTimes: next })
                          }}
                          className={cn("px-2.5 py-1 text-xs rounded-lg border font-medium",
                            taken
                              ? "bg-brand text-white border-brand cursor-default"
                              : selected
                                ? "bg-brand text-white border-brand"
                                : "bg-white text-gray-600 border-gray-200 hover:border-brand/40"
                          )}>
                          {formatTime(t)}
                        </button>
                      )
                    })
                  })()}
                </div>
                {/* Custom time + Add */}
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={createForm.customTime}
                    onChange={(e) => setCreateForm({ ...createForm, customTime: e.target.value })}
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!createForm.customTime) return
                      const next = sortTimes([...createForm.startTimes, createForm.customTime])
                      setCreateForm({ ...createForm, startTimes: next })
                    }}
                    className="px-4 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-brand/40 transition-colors"
                  >
                    + Add
                  </button>
                </div>
                {/* Selected chips */}
                {createForm.startTimes.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1.5">Selected ({createForm.startTimes.length}):</div>
                    <div className="flex flex-wrap gap-1.5">
                      {createForm.startTimes.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand/10 text-brand text-xs font-medium">
                          {formatTime(t)} – {formatTime(computeEndTime(t))}
                          <button type="button" onClick={() => setCreateForm({ ...createForm, startTimes: createForm.startTimes.filter((x) => x !== t) })}
                            className="text-brand/60 hover:text-red-500 ml-0.5 text-base leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                  <select
                    required
                    value={createForm.maxCapacity}
                    onChange={(e) => setCreateForm({ ...createForm, maxCapacity: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price (IDR)</label>
                  <input
                    type="number" min="0" step="1000" required
                    value={createForm.price}
                    onChange={(e) => setCreateForm({ ...createForm, price: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  />
                </div>
              </div>

              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">{createError}</div>
              )}

              {/* Existing sessions already on this day (incl. the active one
                  with bookings) — shown at the bottom for reference. */}
              {(() => {
                const dayExisting = slotsForDay(createForm.date)
                  .slice()
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                if (dayExisting.length === 0) return null
                return (
                  <div className="rounded-xl border border-gray-200 p-2.5">
                    <div className="text-xs text-gray-500 font-medium mb-2">Already on this day</div>
                    <div className="space-y-1.5">
                      {dayExisting.map((s) => {
                        const mine = s.trainer?.id === trainer.id
                        return (
                          <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 bg-gray-50 border border-gray-100">
                            <span className="text-sm font-medium text-gray-800">
                              {formatTime(s.startTime)}–{formatTime(s.endTime)}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 tabular-nums">{s._count.bookings}/{s.maxCapacity}</span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded-full text-[10px] font-medium",
                                mine ? "bg-brand/10 text-brand" : s.trainer ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"
                              )}>
                                {s.trainer ? s.trainer.name : "Unassigned"}
                              </span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
              </div>

              <div className="px-6 py-4 flex gap-3 flex-shrink-0 border-t border-gray-100">
                <button type="button" onClick={() => setCreateModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-medium hover:bg-brand-dark disabled:opacity-60">
                  {creating ? "Creating..." : "Create Session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client list popup for a class (Move / Cancel per client). */}
      {clientsSlot && (
        <SlotClients
          slot={clientsSlot}
          allSlots={slots}
          onClose={() => setClientsSlot(null)}
          onChanged={fetchSlots}
        />
      )}
    </div>
  )
}

// Popup listing the clients booked into one class, with Move (to another
// class with a free seat) and Cancel per client — mirrors the Schedule /
// Schedule Beta client rows. Opened from the "people" count on a class.
function SlotClients({
  slot, allSlots, onClose, onChanged,
}: {
  slot: Slot
  allSlots: Slot[]
  onClose: () => void
  onChanged: () => void
}) {
  type Booking = { id: string; clientName: string; clientPhone: string; status: string; paymentStatus: string; slot: { id: string } }
  const [list, setList] = useState<Booking[] | null>(null)
  const { openChat } = useOpenChat()

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/bookings?date=${slot.date}`)
    if (!res.ok) { setList([]); return }
    const all: Booking[] = await res.json()
    setList(all.filter((b) => b.slot?.id === slot.id && b.status === "CONFIRMED"))
  }, [slot.date, slot.id])
  useEffect(() => { load() }, [load])

  const cancel = async (b: Booking) => {
    if (!confirm(`Отменить запись клиента ${b.clientName}?`)) return
    setList((prev) => prev?.filter((x) => x.id !== b.id) ?? null)
    try {
      const res = await fetch(`/api/admin/bookings/${b.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      })
      if (!res.ok) { alert("Не удалось отменить запись. Попробуйте ещё раз."); load() }
    } catch { alert("Сетевая ошибка — не удалось отменить запись."); load() }
    finally { onChanged() }
  }

  const move = async (b: Booking, targetSlotId: string) => {
    setList((prev) => prev?.filter((x) => x.id !== b.id) ?? null)
    try {
      const res = await fetch(`/api/admin/bookings/${b.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: targetSlotId }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error ?? "Не удалось перенести запись."); load() }
    } catch { alert("Сетевая ошибка — не удалось перенести запись."); load() }
    finally { onChanged() }
  }

  const targetOptions = allSlots
    .filter((s) => s.id !== slot.id && s.maxCapacity - s._count.bookings > 0)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .map((t) => ({ id: t.id, label: `${format(new Date(t.date + "T00:00:00"), "MMM d")} · ${formatTime(t.startTime)}` }))

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-gray-900">Клиенты класса</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {format(new Date(slot.date + "T00:00:00"), "EEE, MMM d")} · {formatTime(slot.startTime)}–{formatTime(slot.endTime)}
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрыть" className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-2">
          {list === null ? (
            <PetalSpinner />
          ) : list.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-6">На этот класс пока никто не записан.</div>
          ) : (
            list.map((b) => (
              <ClientBookingRow
                key={b.id}
                name={b.clientName}
                phone={b.clientPhone}
                onOpenChat={() => openChat(b.clientPhone, b.clientName)}
                targets={targetOptions}
                onMove={(targetId) => move(b, targetId)}
                onCancel={() => cancel(b)}
                paid={b.paymentStatus === "PAID"}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
