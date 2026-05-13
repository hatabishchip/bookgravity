"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  format, addDays, startOfWeek, addWeeks, subWeeks,
  startOfMonth, endOfMonth, endOfWeek, addMonths, subMonths, isSameMonth,
} from "date-fns"
import { ChevronLeft, ChevronRight, X, Check, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
}

function computeEndTime(startTime: string) {
  const [h, m] = startTime.split(":").map(Number)
  const endMin = h * 60 + m + 120
  return `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`
}

const VIEW_LABELS: Record<View, string> = { week: "Week", "2weeks": "2 Weeks", month: "Month" }
const todayStr = format(new Date(), "yyyy-MM-dd")

const EMPTY_CREATE = {
  date: format(new Date(), "yyyy-MM-dd"),
  startTime: "10:00",
  maxCapacity: 6,
  price: 300000,
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
  const [toggling, setToggling] = useState<string | null>(null)

  // Create modal
  const [createModal, setCreateModal] = useState<string | null>(null) // date string
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  const days = useMemo(() => {
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(anchor, i))
    if (view === "2weeks") return Array.from({ length: 14 }, (_, i) => addDays(anchor, i))
    const mStart = startOfMonth(anchor)
    const mEnd = endOfMonth(anchor)
    const gridStart = startOfWeek(mStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(mEnd, { weekStartsOn: 1 })
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
  }, [from, to])

  useEffect(() => { fetchSlots() }, [fetchSlots])

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
    if (toggling) return
    const isMine = slot.trainer?.id === trainer.id
    setToggling(slot.id)

    await fetch(`/api/admin/slots?id=${slot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime: slot.startTime,
        trainerId: isMine ? null : trainer.id,
        maxCapacity: slot.maxCapacity,
        price: slot.price,
      }),
    })

    await fetchSlots()
    setToggling(null)
  }

  // Create new slot pre-assigned to this trainer
  const openCreate = (date: string) => {
    setCreateForm({ ...EMPTY_CREATE, date })
    setCreateError("")
    setCreateModal(date)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError("")

    const res = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: createForm.date,
        startTime: createForm.startTime,
        trainerId: trainer.id,
        maxCapacity: Number(createForm.maxCapacity),
        price: Number(createForm.price),
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      setCreateError(err.error ?? "Error")
      setCreating(false)
      return
    }

    await fetchSlots()
    setCreateModal(null)
    setCreating(false)
  }

  const slotsForDay = (date: string) => slots.filter((s) => s.date === date)
  const mySlots = slots.filter((s) => s.trainer?.id === trainer.id).length
  const isMonthView = view === "month"
  const cellMinH = isMonthView ? "min-h-[90px]" : view === "2weeks" ? "min-h-[140px]" : "min-h-[200px]"
  const cellPad = isMonthView ? "p-1.5" : "p-2.5"

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex">
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
            <button onClick={onClose} className="sm:hidden p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
              {(["week", "2weeks", "month"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "flex-1 lg:flex-initial px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all",
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

            <button onClick={onClose} className="hidden sm:block p-2 hover:bg-gray-100 rounded-lg ml-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-2 hidden md:flex items-center gap-5 text-xs text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#2C6E49] flex items-center justify-center">
              <Check size={8} className="text-white" strokeWidth={3} />
            </span>
            Assigned — click to remove
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border border-gray-300 bg-white" />
            Not assigned — click to assign
          </span>
          <span className="flex items-center gap-1.5">
            <Plus size={11} className="text-[#2C6E49]" />
            Click empty day to add new session
          </span>
        </div>

        {/* Calendar */}
        <div className="px-2 sm:px-6 pb-6 flex-1">
          {/* Day headers — only on desktop */}
          <div className="hidden lg:grid grid-cols-7 gap-2 mb-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 uppercase tracking-wide py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-7 gap-2">
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd")
              const isToday = dateStr === todayStr
              const isOtherMonth = isMonthView && !isSameMonth(day, anchor)
              const daySlots = slotsForDay(dateStr)

              return (
                <div
                  key={dateStr}
                  onClick={() => openCreate(dateStr)}
                  className={cn(
                    "bg-white rounded-2xl shadow-sm transition-all cursor-pointer group",
                    "hover:ring-1 hover:ring-gray-300",
                    cellPad, cellMinH,
                    isOtherMonth && "opacity-40"
                  )}
                >
                  {/* Date number */}
                  <div className={cn("text-center", isMonthView ? "mb-1" : "mb-2")}>
                    <div className="lg:hidden text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      {format(day, "EEE")}
                    </div>
                    <div className={cn(
                      "font-bold mx-auto flex items-center justify-center rounded-full",
                      isMonthView ? "text-sm w-6 h-6" : "text-lg w-8 h-8 mt-0.5",
                      isToday ? "bg-gray-800 text-white" : "text-gray-800"
                    )}>
                      {format(day, "d")}
                    </div>
                  </div>

                  {/* Slots */}
                  <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                    {daySlots.map((slot) => {
                      const isMine = slot.trainer?.id === trainer.id
                      const otherColor = slot.trainer && !isMine ? slot.trainer.color : null
                      const isLoading = toggling === slot.id

                      const otherStyle = otherColor
                        ? { backgroundColor: hexToRgba(otherColor, 0.12), borderColor: hexToRgba(otherColor, 0.4) }
                        : {}

                      return (
                        <button
                          key={slot.id}
                          onClick={() => handleToggle(slot)}
                          disabled={isLoading}
                          style={
                            isMine
                              ? { backgroundColor: trainer.color, borderColor: trainer.color }
                              : otherStyle
                          }
                          className={cn(
                            "w-full text-left rounded-lg transition-all border",
                            isMonthView ? "p-1" : "p-1.5",
                            !isMine && !otherColor && "bg-[#EDEEF1] border-gray-200 hover:border-gray-300 hover:bg-gray-200",
                            isLoading && "opacity-50"
                          )}
                        >
                          <div className="flex items-start gap-1">
                            {/* Checkbox */}
                            <span className={cn(
                              "flex-shrink-0 mt-0.5 rounded-sm border flex items-center justify-center transition-colors",
                              isMonthView ? "w-2.5 h-2.5" : "w-3.5 h-3.5",
                              isMine ? "bg-white border-white" : "border-gray-300 bg-white"
                            )}>
                              {isMine && <Check size={isMonthView ? 6 : 9} strokeWidth={3} style={{ color: trainer.color }} />}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div
                                className={cn(
                                  "font-semibold leading-tight truncate",
                                  isMonthView ? "text-[9px]" : "text-xs",
                                  isMine ? "text-white" : "text-gray-700"
                                )}
                                style={!isMine && otherColor ? { color: otherColor } : {}}
                              >
                                {formatTime(slot.startTime)}
                              </div>
                              {!isMonthView && (
                                <div
                                  className={cn(
                                    "text-[10px] truncate mt-0.5",
                                    isMine ? "text-white/70" : "text-gray-400"
                                  )}
                                  style={!isMine && otherColor ? { color: hexToRgba(otherColor, 0.85) } : {}}
                                >
                                  {slot.trainer ? slot.trainer.name : "Unassigned"}
                                </div>
                              )}
                              <div
                                className={cn(
                                  isMonthView ? "text-[8px]" : "text-[10px]",
                                  isMine ? "text-white/60" : "text-gray-400"
                                )}
                                style={!isMine && otherColor ? { color: hexToRgba(otherColor, 0.7) } : {}}
                              >
                                {slot._count.bookings}/{slot.maxCapacity}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Add hint on hover */}
                  {!isMonthView && (
                    <div className="mt-1 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity py-1">
                      <Plus size={10} className="text-gray-300" />
                      <span className="text-[10px] text-gray-300">add</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Create session modal */}
      {createModal !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Add Session</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  Trainer: <span className="text-[#2C6E49] font-medium">{trainer.name}</span>
                </p>
              </div>
              <button onClick={() => setCreateModal(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={createForm.date}
                  onChange={(e) => { setCreateForm({ ...createForm, date: e.target.value }); e.target.blur() }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={createForm.startTime}
                    onChange={(e) => setCreateForm({ ...createForm, startTime: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <div className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm text-gray-500">
                    {computeEndTime(createForm.startTime)} <span className="text-xs text-gray-400">(120 min)</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (1–6)</label>
                  <input
                    type="number" min="1" max="6" required
                    value={createForm.maxCapacity}
                    onChange={(e) => setCreateForm({ ...createForm, maxCapacity: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price (IDR)</label>
                  <input
                    type="number" min="0" step="1000" required
                    value={createForm.price}
                    onChange={(e) => setCreateForm({ ...createForm, price: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  />
                </div>
              </div>

              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">{createError}</div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setCreateModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="flex-1 bg-[#2C6E49] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60">
                  {creating ? "Creating..." : "Create Session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
