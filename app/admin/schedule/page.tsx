"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { format, addDays, startOfWeek, addWeeks, subWeeks, startOfMonth, endOfMonth, endOfWeek, addMonths, subMonths, isSameMonth, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Lock, Unlock, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

type View = "week" | "2weeks" | "month"
type Trainer = { id: string; name: string; color: string }
type Slot = {
  id: string; date: string; startTime: string; endTime: string
  maxCapacity: number; price: number
  trainer: { id: string; name: string; color: string } | null
  assistant: { id: string; name: string; color: string } | null
  _count: { bookings: number }
}
type BlockedDay = { id: string; date: string; reason: string | null }

const TIME_PRESETS = ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00"]
const VIEW_LABELS: Record<View, string> = { week: "Week", "2weeks": "2 Weeks", month: "Month" }

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function computeEndTime(startTime: string) {
  const [h, m] = startTime.split(":").map(Number)
  const e = h * 60 + m + 120
  return `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function slotCardStyle(slot: Slot) {
  if (!slot.trainer) return {}
  return {
    backgroundColor: slot.trainer.color,
    borderColor: slot.trainer.color,
  }
}

type SlotAssignment = { trainerId: string; assistantId: string }
const EMPTY_FORM = {
  date: format(new Date(), "yyyy-MM-dd"),
  startTime: "10:00",
  startTimes: [] as string[],
  customTime: "10:00",
  trainerId: "",
  assistantId: "",
  maxCapacity: 6,
  price: 300000,
  assignments: {} as Record<string, SlotAssignment>,
}

function sortTimes(times: string[]) {
  return [...new Set(times)].sort()
}

export default function SchedulePage() {
  const [view, setView] = useState<View>("2weeks")
  const [anchor, setAnchor] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [slots, setSlots] = useState<Slot[]>([])
  const [blockedDays, setBlockedDays] = useState<BlockedDay[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modal, setModal] = useState<null | "create" | Slot>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)
  const [blockModal, setBlockModal] = useState<{ date: string; existing?: BlockedDay } | null>(null)
  const [blockReason, setBlockReason] = useState("")
  const [blocking, setBlocking] = useState(false)
  type CopyPlan = { weekIndex: number; targetStart: Date; toCopy: Slot[]; skipped: number }
  const [copyModal, setCopyModal] = useState<null | {
    sourceStart: Date
    sourceSlots: Slot[]
    weeksAhead: number
    plans: CopyPlan[]
    loading: boolean
    running: boolean
  }>(null)

  const todayStr = format(new Date(), "yyyy-MM-dd")

  const days = useMemo(() => {
    if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(anchor, i))
    if (view === "2weeks") return Array.from({ length: 14 }, (_, i) => addDays(anchor, i))
    const mStart = startOfMonth(anchor)
    const mEnd = endOfMonth(anchor)
    const gs = startOfWeek(mStart, { weekStartsOn: 1 })
    const ge = endOfWeek(mEnd, { weekStartsOn: 1 })
    const r: Date[] = []; let d = gs
    while (d <= ge) { r.push(d); d = addDays(d, 1) }
    return r
  }, [view, anchor])

  const from = format(days[0], "yyyy-MM-dd")
  const to = format(days[days.length - 1], "yyyy-MM-dd")

  const headerLabel = useMemo(() => {
    if (view === "month") return format(anchor, "MMMM yyyy")
    return `${format(days[0], "MMMM d")} – ${format(days[days.length - 1], "MMMM d, yyyy")}`
  }, [view, anchor, days])

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

  const fetchSlots = useCallback(async () => {
    const res = await fetch(`/api/admin/slots?from=${from}&to=${to}`)
    setSlots(await res.json())
  }, [from, to])

  const fetchBlocked = useCallback(async () => {
    const res = await fetch(`/api/admin/blocked-days?from=${from}&to=${to}`)
    setBlockedDays(await res.json())
  }, [from, to])

  const fetchTrainers = useCallback(async () => {
    const res = await fetch("/api/admin/trainers")
    setTrainers(await res.json())
  }, [])

  useEffect(() => { fetchSlots() }, [fetchSlots])
  useEffect(() => { fetchBlocked() }, [fetchBlocked])
  useEffect(() => { fetchTrainers() }, [fetchTrainers])

  const openCreate = (date: string) => {
    const bd = blockedDays.find((b) => b.date === date)
    if (bd) return
    setSelectedDate(date)
    // Pre-fill startTimes with existing slot times for that date so the form acts as
    // a "manage day's sessions" view (toggle to add or remove).
    const existing = slots.filter((s) => s.date === date)
    const existingTimes = sortTimes(existing.map((s) => s.startTime))
    setForm({ ...EMPTY_FORM, date, startTimes: existingTimes, assignments: {} })
    setFormError("")
    setModal("create")
  }

  const openEdit = (slot: Slot) => {
    setSelectedDate(slot.date)
    setForm({ date: slot.date, startTime: slot.startTime, startTimes: [], customTime: slot.startTime, trainerId: slot.trainer?.id ?? "", assistantId: slot.assistant?.id ?? "", maxCapacity: slot.maxCapacity, price: slot.price, assignments: {} })
    setFormError("")
    setModal(slot)
  }

  const closeModal = () => { setModal(null); setFormError("") }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const isEdit = modal !== null && modal !== "create"

    if (isEdit) {
      setSaving(true); setFormError("")
      const res = await fetch(`/api/admin/slots?id=${(modal as Slot).id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: form.startTime, trainerId: form.trainerId || null, assistantId: form.assistantId || null, maxCapacity: form.maxCapacity, price: form.price }),
      })
      if (!res.ok) { const err = await res.json(); setFormError(err.error ?? "Error"); setSaving(false); return }
      await fetchSlots(); closeModal(); setSaving(false)
      return
    }

    // Create mode: diff against existing slots on this date
    const existing = slots.filter((s) => s.date === form.date)
    const existingByTime = new Map(existing.map((s) => [s.startTime, s] as const))
    const desired = new Set(form.startTimes)
    const toDelete = existing.filter((s) => !desired.has(s.startTime))
    const toCreate = form.startTimes.filter((t) => !existingByTime.has(t))

    if (toCreate.length === 0 && toDelete.length === 0) {
      closeModal()
      return
    }
    setSaving(true); setFormError("")
    const failed: string[] = []

    // Deletes first to free up any potential conflicts
    for (const s of toDelete) {
      const res = await fetch(`/api/admin/slots?id=${s.id}`, { method: "DELETE" })
      if (!res.ok) failed.push(`Delete ${s.startTime}: error`)
    }
    for (const startTime of toCreate) {
      const assignment = form.assignments[startTime] ?? { trainerId: "", assistantId: "" }
      const res = await fetch("/api/admin/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          startTime,
          trainerId: assignment.trainerId || undefined,
          assistantId: assignment.assistantId || null,
          maxCapacity: Number(form.maxCapacity),
          price: Number(form.price),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        failed.push(`${startTime}: ${err.error ?? "error"}`)
      }
    }
    await fetchSlots(); setSaving(false)
    if (failed.length > 0) {
      setFormError(`Some changes failed — ${failed.join("; ")}`)
      return
    }
    closeModal()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this session? Existing bookings will remain.")) return
    setDeleting(id)
    await fetch(`/api/admin/slots?id=${id}`, { method: "DELETE" })
    await fetchSlots(); setDeleting(null)
    if (modal !== null && modal !== "create" && (modal as Slot).id === id) closeModal()
  }

  // Block/unblock day
  const openBlockModal = (e: React.MouseEvent, date: string) => {
    e.stopPropagation()
    const existing = blockedDays.find((b) => b.date === date)
    setBlockReason(existing?.reason ?? "")
    setBlockModal({ date, existing })
  }

  const handleBlock = async () => {
    if (!blockModal) return
    setBlocking(true)
    if (blockModal.existing) {
      await fetch(`/api/admin/blocked-days?date=${blockModal.date}`, { method: "DELETE" })
    } else {
      await fetch("/api/admin/blocked-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: blockModal.date, reason: blockReason || null }),
      })
    }
    await fetchBlocked()
    setBlockModal(null); setBlocking(false)
  }

  // Build a copy plan for N weeks ahead, given source slots and start date.
  // Skips times that already exist on the target week (same date+startTime).
  const buildCopyPlans = async (sourceSlots: Slot[], sourceStart: Date, weeksAhead: number): Promise<CopyPlan[]> => {
    const plans: CopyPlan[] = []
    for (let i = 1; i <= weeksAhead; i++) {
      const targetStart = addDays(sourceStart, 7 * i)
      const targetEnd = addDays(targetStart, 6)
      const res = await fetch(`/api/admin/slots?from=${format(targetStart, "yyyy-MM-dd")}&to=${format(targetEnd, "yyyy-MM-dd")}`)
      const dstSlots: Slot[] = await res.json()
      const dstKeys = new Set(dstSlots.map((s) => `${s.date}|${s.startTime}`))
      const toCopy = sourceSlots.filter((s) => {
        const newDate = format(addDays(parseISO(s.date), 7 * i), "yyyy-MM-dd")
        return !dstKeys.has(`${newDate}|${s.startTime}`)
      })
      plans.push({ weekIndex: i, targetStart, toCopy, skipped: sourceSlots.length - toCopy.length })
    }
    return plans
  }

  const openCopyModal = async () => {
    const sourceStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const sourceEnd = addDays(sourceStart, 6)
    setCopyModal({ sourceStart, sourceSlots: [], weeksAhead: 1, plans: [], loading: true, running: false })
    const srcRes = await fetch(`/api/admin/slots?from=${format(sourceStart, "yyyy-MM-dd")}&to=${format(sourceEnd, "yyyy-MM-dd")}`)
    const sourceSlots: Slot[] = await srcRes.json()
    const plans = await buildCopyPlans(sourceSlots, sourceStart, 1)
    setCopyModal({ sourceStart, sourceSlots, weeksAhead: 1, plans, loading: false, running: false })
  }

  const changeWeeksAhead = async (n: number) => {
    if (!copyModal) return
    setCopyModal({ ...copyModal, weeksAhead: n, loading: true })
    const plans = await buildCopyPlans(copyModal.sourceSlots, copyModal.sourceStart, n)
    setCopyModal((prev) => prev ? { ...prev, weeksAhead: n, plans, loading: false } : null)
  }

  const runCopy = async () => {
    if (!copyModal || copyModal.loading || copyModal.running) return
    setCopyModal({ ...copyModal, running: true })
    for (const plan of copyModal.plans) {
      for (const s of plan.toCopy) {
        const newDate = format(addDays(parseISO(s.date), 7 * plan.weekIndex), "yyyy-MM-dd")
        await fetch("/api/admin/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: newDate,
            startTime: s.startTime,
            trainerId: s.trainer?.id ?? undefined,
            assistantId: s.assistant?.id ?? null,
            maxCapacity: s.maxCapacity,
            price: s.price,
          }),
        })
      }
    }
    await fetchSlots()
    setCopyModal(null)
  }

  const slotsForDay = (d: string) => slots.filter((s) => s.date === d)
  const isEdit = modal !== null && modal !== "create"
  const isMonthView = view === "month"
  const cellPad = isMonthView ? "p-1.5" : "p-2.5"
  const cellMinH = isMonthView ? "min-h-[90px]" : view === "2weeks" ? "min-h-[160px]" : "min-h-[220px]"

  return (
    <div>
      {/* Header */}
      <div className="mb-4 space-y-3">
        {/* Title row */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Schedule</h1>
            <p className="text-gray-500 text-xs lg:text-sm mt-0.5 truncate">{headerLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={openCopyModal}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 px-3 lg:px-4 py-2 rounded-xl text-xs lg:text-sm font-medium hover:border-[#2C6E49]/40 hover:bg-gray-50 transition-colors"
              title="Copy this week's schedule to next week"
            >
              <Copy size={15} /> <span className="hidden sm:inline">Copy week</span>
            </button>
            <button
              onClick={() => openCreate(selectedDate ?? todayStr)}
              className="flex items-center gap-2 bg-[#2C6E49] text-white px-3 lg:px-4 py-2 rounded-xl text-xs lg:text-sm font-medium hover:bg-[#1E4D34] transition-colors"
            >
              <Plus size={16} /> <span className="hidden sm:inline">Add Session</span><span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>

        {/* View switcher — full width on mobile */}
        <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5 lg:inline-flex">
          {(["week", "2weeks", "month"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "flex-1 lg:flex-initial px-3 lg:px-4 py-2 rounded-lg text-sm font-medium transition-all",
                view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        {/* Navigation row — clearly Prev / Today / Next */}
        <div className="flex items-stretch gap-2">
          <button
            onClick={handlePrev}
            aria-label={view === "month" ? "Previous month" : "Previous week"}
            className="flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">Previous</span>
          </button>
          <button
            onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="flex-1 lg:flex-initial px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            Today
          </button>
          <button
            onClick={handleNext}
            aria-label={view === "month" ? "Next month" : "Next week"}
            className="flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Day headers — month view always 7 cols; week/2weeks responsive */}
      <div className={cn(
        "grid gap-2 mb-1.5 px-0.5",
        isMonthView ? "grid-cols-7" : "hidden lg:grid lg:grid-cols-7"
      )}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 uppercase tracking-wide py-1">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d.charAt(0)}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className={cn(
        "grid gap-2",
        isMonthView ? "grid-cols-7" : "grid-cols-2 lg:grid-cols-7"
      )}>
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd")
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const daySlots = slotsForDay(dateStr)
          const isOtherMonth = isMonthView && !isSameMonth(day, anchor)
          const blocked = blockedDays.find((b) => b.date === dateStr)

          return (
            <div
              key={dateStr}
              onClick={() => !blocked && openCreate(dateStr)}
              className={cn(
                "rounded-2xl shadow-sm transition-all group relative",
                cellPad, cellMinH,
                blocked ? "bg-gray-100 cursor-not-allowed" : "bg-white cursor-pointer",
                isOtherMonth && "opacity-40",
                !blocked && isSelected ? "ring-2 ring-[#2C6E49]" : !blocked && "hover:ring-1 hover:ring-[#2C6E49]/30",
              )}
            >
              {/* Date + lock */}
              <div className={cn("text-center relative", isMonthView ? "mb-1" : "mb-2.5")}>
                {!isMonthView && (
                  <div className="lg:hidden text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                    {format(day, "EEE")}
                  </div>
                )}
                <div className={cn("font-bold mx-auto flex items-center justify-center rounded-full", isMonthView ? "text-sm w-6 h-6" : "text-lg w-8 h-8 mt-0.5",
                  isToday && !blocked ? "bg-[#2C6E49] text-white" : blocked ? "text-gray-400" : "text-gray-800"
                )}>
                  {format(day, "d")}
                </div>
                {/* Block toggle button */}
                <button
                  onClick={(e) => openBlockModal(e, dateStr)}
                  title={blocked ? `Blocked${blocked.reason ? ": " + blocked.reason : ""}` : "Block day"}
                  className={cn(
                    "absolute top-0 right-0 p-0.5 rounded transition-all",
                    blocked ? "opacity-60 text-gray-500 hover:text-red-500" : "opacity-0 group-hover:opacity-60 text-gray-300 hover:text-orange-500"
                  )}
                >
                  {blocked ? <Lock size={10} /> : <Unlock size={10} />}
                </button>
              </div>

              {/* Blocked label */}
              {blocked && (
                <div className="text-center">
                  <span className="text-[9px] text-gray-400 bg-gray-200 rounded px-1.5 py-0.5">
                    {blocked.reason ?? "Blocked"}
                  </span>
                </div>
              )}

              {/* Slots */}
              {!blocked && (
                <div className="space-y-1.5">
                  {daySlots.map((slot) => {
                    const cardStyle = slotCardStyle(slot)
                    const hasTrainer = !!slot.trainer

                    return (
                      <div
                        key={slot.id}
                        onClick={(e) => { e.stopPropagation(); openEdit(slot) }}
                        style={cardStyle}
                        className={cn(
                          "rounded-lg p-1.5 relative group/slot cursor-pointer transition-all border",
                          !hasTrainer && "bg-gray-50 border-gray-200 hover:bg-gray-100"
                        )}
                      >
                        <div
                          className="text-xs font-semibold leading-tight"
                          style={hasTrainer ? { color: "white" } : {}}
                        >
                          {formatTime(slot.startTime)}
                          {!isMonthView && (
                            <span className="block font-normal text-[10px] opacity-70">{formatTime(slot.endTime)}</span>
                          )}
                        </div>
                        <div className={cn("mt-0.5 truncate", isMonthView ? "text-[8px]" : "text-[10px]")}
                          style={hasTrainer ? { color: "rgba(255,255,255,0.75)" } : { color: "#9CA3AF" }}
                        >
                          {slot.trainer?.name ?? "—"}
                          {!isMonthView && slot.assistant && (
                            <span className="opacity-75"> + {slot.assistant.name}</span>
                          )}
                        </div>
                        <div
                          className={isMonthView ? "text-[8px]" : "text-[10px]"}
                          style={hasTrainer ? { color: "rgba(255,255,255,0.6)" } : { color: "#D1D5DB" }}
                        >
                          {slot._count.bookings}/{slot.maxCapacity}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(slot.id) }}
                          disabled={deleting === slot.id}
                          className="absolute top-1 right-1 opacity-0 group-hover/slot:opacity-100 p-0.5 bg-white hover:bg-red-50 rounded shadow-sm text-red-400 transition-all border border-red-100"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )
                  })}
                  {daySlots.length < 7 && !isMonthView && (
                    <div className="flex items-center justify-center gap-1 py-1.5 text-gray-300 opacity-0 group-hover:opacity-100">
                      <Plus size={11} /><span className="text-[10px]">add</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Block day modal */}
      {blockModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                {blockModal.existing ? "Unblock Day" : "Block Day"}
              </h2>
              <button onClick={() => setBlockModal(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {format(new Date(blockModal.date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
            </p>
            {blockModal.existing ? (
              <p className="text-sm text-gray-600 mb-4">
                This day is currently blocked{blockModal.existing.reason ? ` (${blockModal.existing.reason})` : ""}. Remove the block?
              </p>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="e.g. Holiday, Renovation, Private event"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setBlockModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleBlock}
                disabled={blocking}
                className={cn("flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60",
                  blockModal.existing ? "bg-green-600 hover:bg-green-700" : "bg-orange-500 hover:bg-orange-600"
                )}
              >
                {blocking ? "..." : blockModal.existing ? "Unblock" : "Block Day"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{isEdit ? "Edit Session" : (slots.some((s) => s.date === form.date) ? "Manage day's sessions" : "Add Session")}</h2>
                <p className="text-sm text-gray-400 mt-0.5">{format(new Date(form.date + "T00:00:00"), "EEEE, MMMM d")}</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {!isEdit && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" required value={form.date}
                    onChange={(e) => { setForm({ ...form, date: e.target.value }); e.target.blur() }}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  />
                </div>
              )}

              {isEdit ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {TIME_PRESETS.map((t) => (
                      <button key={t} type="button" onClick={() => setForm({ ...form, startTime: t })}
                        className={cn("px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors",
                          form.startTime === t ? "bg-[#2C6E49] text-white border-[#2C6E49]" : "bg-white text-gray-600 border-gray-200 hover:border-[#2C6E49]/40"
                        )}>
                        {formatTime(t)}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="time" required value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                    />
                    <div className="w-full border border-gray-200 bg-gray-50 rounded-xl px-4 py-2.5 text-sm text-gray-500">
                      {computeEndTime(form.startTime)} <span className="text-xs text-gray-400">(120 min)</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session times</label>
                  <p className="text-xs text-gray-400 mb-2">Pick one or more — each creates a separate session (+120 min)</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {TIME_PRESETS.map((t) => {
                      const selected = form.startTimes.includes(t)
                      return (
                        <button key={t} type="button" onClick={() => {
                          const next = selected ? form.startTimes.filter((x) => x !== t) : sortTimes([...form.startTimes, t])
                          setForm({ ...form, startTimes: next })
                        }}
                          className={cn("px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors",
                            selected ? "bg-[#2C6E49] text-white border-[#2C6E49]" : "bg-white text-gray-600 border-gray-200 hover:border-[#2C6E49]/40"
                          )}>
                          {formatTime(t)}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input type="time" value={form.customTime}
                      onChange={(e) => setForm({ ...form, customTime: e.target.value })}
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                    />
                    <button type="button"
                      onClick={() => {
                        if (!form.customTime) return
                        setForm({ ...form, startTimes: sortTimes([...form.startTimes, form.customTime]) })
                      }}
                      className="px-4 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-[#2C6E49]/40 transition-colors"
                    >
                      + Add
                    </button>
                  </div>
                  {(() => {
                    const existingForDate = slots.filter((s) => s.date === form.date)
                    const existingTimes = new Set(existingForDate.map((s) => s.startTime))
                    const desiredSet = new Set(form.startTimes)
                    const removed = existingForDate.filter((s) => !desiredSet.has(s.startTime))
                    return (form.startTimes.length > 0 || removed.length > 0) && (
                      <div className="mt-3 space-y-2">
                        {form.startTimes.length > 0 && (
                          <div>
                            <div className="text-xs text-gray-500 mb-1.5">Sessions on this day ({form.startTimes.length}):</div>
                            <div className="space-y-1.5">
                              {form.startTimes.map((t) => {
                                const isExisting = existingTimes.has(t)
                                const slot = existingForDate.find((s) => s.startTime === t)
                                const assignment = form.assignments[t] ?? { trainerId: "", assistantId: "" }
                                if (isExisting) {
                                  return (
                                    <div key={t} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-100 text-xs">
                                      <span className="font-medium text-gray-700">{formatTime(t)} – {formatTime(computeEndTime(t))}</span>
                                      <span className="text-gray-400">·</span>
                                      <span className="text-gray-500 truncate">
                                        {slot?.trainer ? slot.trainer.name : "Unassigned"}
                                        {slot?.assistant && ` + ${slot.assistant.name}`}
                                      </span>
                                      <button type="button" onClick={() => setForm({ ...form, startTimes: form.startTimes.filter((x) => x !== t) })}
                                        className="text-gray-400 hover:text-red-500 ml-auto text-base leading-none flex-shrink-0">×</button>
                                    </div>
                                  )
                                }
                                // New session — per-time trainer + assistant
                                return (
                                  <div key={t} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#2C6E49]/5 border border-[#2C6E49]/15 text-xs">
                                    <span className="font-medium text-[#2C6E49] whitespace-nowrap">＋ {formatTime(t)} – {formatTime(computeEndTime(t))}</span>
                                    <select
                                      value={assignment.trainerId}
                                      onChange={(e) => {
                                        const next = e.target.value
                                        setForm((prev) => ({
                                          ...prev,
                                          assignments: { ...prev.assignments, [t]: { trainerId: next, assistantId: next ? assignment.assistantId : "" } },
                                        }))
                                      }}
                                      className="ml-auto text-xs border border-gray-200 rounded-md px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#2C6E49]/30 max-w-[110px]"
                                    >
                                      <option value="">Unassigned</option>
                                      {trainers.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                                    </select>
                                    {assignment.trainerId && (
                                      <select
                                        value={assignment.assistantId}
                                        onChange={(e) => setForm((prev) => ({
                                          ...prev,
                                          assignments: { ...prev.assignments, [t]: { ...assignment, assistantId: e.target.value } },
                                        }))}
                                        className="text-xs border border-dashed border-gray-200 rounded-md px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#2C6E49]/30 max-w-[110px] text-gray-500"
                                        title="Assistant"
                                      >
                                        <option value="">+ Asst</option>
                                        {trainers.filter((tr) => tr.id !== assignment.trainerId).map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                                      </select>
                                    )}
                                    <button type="button" onClick={() => {
                                      const newAssignments = { ...form.assignments }
                                      delete newAssignments[t]
                                      setForm({ ...form, startTimes: form.startTimes.filter((x) => x !== t), assignments: newAssignments })
                                    }} className="text-[#2C6E49]/60 hover:text-red-500 text-base leading-none flex-shrink-0">×</button>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {removed.length > 0 && (
                          <div>
                            <div className="text-xs text-rose-600 mb-1.5">Will be deleted ({removed.length}):</div>
                            <div className="flex flex-wrap gap-1.5">
                              {removed.map((s) => (
                                <span key={s.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium line-through decoration-rose-300">
                                  {formatTime(s.startTime)}
                                  <button type="button" onClick={() => setForm({ ...form, startTimes: sortTimes([...form.startTimes, s.startTime]) })}
                                    className="text-rose-400 hover:text-rose-600 ml-0.5 text-base leading-none no-underline">↺</button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {isEdit && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Trainer</label>
                    <select value={form.trainerId} onChange={(e) => {
                      const next = e.target.value
                      setForm((prev) => ({ ...prev, trainerId: next, assistantId: next ? prev.assistantId : "" }))
                    }}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] bg-white">
                      <option value="">Unassigned</option>
                      {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  {form.assistantId ? (
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="text-gray-400 text-xs">Assistant</span>
                        <span className="font-medium">{trainers.find((t) => t.id === form.assistantId)?.name}</span>
                      </div>
                      <button type="button" onClick={() => setForm({ ...form, assistantId: "" })}
                        className="text-gray-400 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                    </div>
                  ) : (
                    <select
                      value=""
                      disabled={!form.trainerId}
                      onChange={(e) => { if (e.target.value) setForm({ ...form, assistantId: e.target.value }) }}
                      className="w-full border border-dashed border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/20 focus:border-[#2C6E49]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50"
                    >
                      <option value="">{form.trainerId ? "+ Add assistant (optional)" : "Select a trainer first"}</option>
                      {form.trainerId && trainers.filter((t) => t.id !== form.trainerId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (1–6)</label>
                  <input type="number" min="1" max="6" required value={form.maxCapacity}
                    onChange={(e) => setForm({ ...form, maxCapacity: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price (IDR)</label>
                  <input type="number" min="0" step="1000" required value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  />
                </div>
              </div>

              {formError && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">{formError}</div>}

              <div className="flex gap-3 pt-1">
                {isEdit && (
                  <button type="button" onClick={() => handleDelete((modal as Slot).id)} disabled={deleting !== null}
                    className="px-3 border border-red-200 text-red-500 py-2.5 rounded-xl text-sm hover:bg-red-50 disabled:opacity-50">
                    <Trash2 size={15} />
                  </button>
                )}
                <button type="button" onClick={closeModal} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-[#2C6E49] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60">
                  {saving ? "Saving..." : isEdit ? "Save Changes" : (() => {
                    const existing = slots.filter((s) => s.date === form.date)
                    const desired = new Set(form.startTimes)
                    const toCreate = form.startTimes.filter((t) => !existing.some((s) => s.startTime === t)).length
                    const toDelete = existing.filter((s) => !desired.has(s.startTime)).length
                    if (toCreate === 0 && toDelete === 0) return "Save"
                    const parts: string[] = []
                    if (toCreate > 0) parts.push(`+${toCreate}`)
                    if (toDelete > 0) parts.push(`−${toDelete}`)
                    return `Save (${parts.join(" / ")})`
                  })()}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy week modal */}
      {copyModal && (() => {
        const totalToCopy = copyModal.plans.reduce((sum, p) => sum + p.toCopy.length, 0)
        const totalSkipped = copyModal.plans.reduce((sum, p) => sum + p.skipped, 0)
        const sourceLen = copyModal.sourceSlots.length
        const lastTarget = copyModal.plans[copyModal.plans.length - 1]?.targetStart
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
              <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Copy week forward</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    From {format(copyModal.sourceStart, "MMM d")} – {format(addDays(copyModal.sourceStart, 6), "MMM d")}
                    {lastTarget && ` → through ${format(addDays(lastTarget, 6), "MMM d")}`}
                  </p>
                </div>
                <button onClick={() => !copyModal.running && setCopyModal(null)} disabled={copyModal.running}
                  className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-40"><X size={18} /></button>
              </div>

              <div className="px-6 py-5 overflow-y-auto">
                {/* Week count selector */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Copy to how many weeks ahead?</label>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={copyModal.loading || copyModal.running}
                        onClick={() => changeWeeksAhead(n)}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50",
                          copyModal.weeksAhead === n
                            ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                            : "bg-white text-gray-700 border-gray-200 hover:border-[#2C6E49]/40"
                        )}
                      >
                        {n} {n === 1 ? "week" : "weeks"}
                      </button>
                    ))}
                  </div>
                </div>

                {copyModal.loading ? (
                  <div className="text-center py-6 text-sm text-gray-500">Analyzing weeks…</div>
                ) : sourceLen === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm font-medium text-gray-800">This week has no sessions to copy</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="mb-3 p-3 rounded-xl bg-[#2C6E49]/5 border border-[#2C6E49]/10">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-[#2C6E49]">{totalToCopy}</span>
                        <span className="text-sm text-gray-700">
                          session{totalToCopy !== 1 ? "s" : ""} will be created across {copyModal.weeksAhead} week{copyModal.weeksAhead !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {totalSkipped > 0 && (
                        <div className="text-xs text-amber-700 mt-1">
                          {totalSkipped} skipped — already exist at the same date and time
                        </div>
                      )}
                    </div>

                    {/* Per-week breakdown */}
                    <div className="space-y-2.5">
                      {copyModal.plans.map((plan) => (
                        <div key={plan.weekIndex} className="rounded-xl border border-gray-100 overflow-hidden">
                          <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                            <div className="text-xs font-semibold text-gray-700">
                              Week {plan.weekIndex} · {format(plan.targetStart, "MMM d")} – {format(addDays(plan.targetStart, 6), "MMM d")}
                            </div>
                            <div className="text-xs text-gray-500">
                              <span className="text-[#2C6E49] font-medium">+{plan.toCopy.length}</span>
                              {plan.skipped > 0 && <span className="ml-2 text-amber-600">−{plan.skipped} skipped</span>}
                            </div>
                          </div>
                          {plan.toCopy.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-gray-400 italic">All sessions already exist this week</div>
                          ) : (
                            <div className="divide-y divide-gray-50 max-h-32 overflow-y-auto">
                              {plan.toCopy.map((s) => {
                                const newDate = format(addDays(parseISO(s.date), 7 * plan.weekIndex), "EEE, MMM d")
                                return (
                                  <div key={`${plan.weekIndex}-${s.id}`} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                    <div>
                                      <div className="font-medium text-gray-800">{newDate} · {formatTime(s.startTime)}</div>
                                      <div className="text-gray-400 mt-0.5">
                                        {s.trainer ? s.trainer.name : "Unassigned"}
                                        {s.assistant && ` + ${s.assistant.name}`}
                                      </div>
                                    </div>
                                    <div className="text-gray-400">{Math.round(s.price / 1000)}k</div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="px-6 pb-5 flex gap-2 flex-shrink-0 border-t border-gray-100 pt-4">
                <button
                  onClick={() => !copyModal.running && setCopyModal(null)}
                  disabled={copyModal.running}
                  className="flex-1 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={runCopy}
                  disabled={copyModal.loading || copyModal.running || totalToCopy === 0}
                  className="flex-1 bg-[#2C6E49] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60"
                >
                  {copyModal.running ? "Copying…" : totalToCopy > 0 ? `Copy ${totalToCopy} sessions` : "Nothing to copy"}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
