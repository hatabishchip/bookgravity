"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import {
  format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, isSameMonth, isSameDay,
} from "date-fns"
import { X, Plus, Trash2, Eye, EyeOff } from "lucide-react"
import { whatsappLink } from "@/lib/whatsapp"
import { WhatsAppIcon } from "@/app/_components/WhatsAppIcon"
import { PriceInput } from "@/app/_components/PriceInput"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import { cn } from "@/lib/utils"

type Trainer = { id: string; name: string; color: string }

type Service = { id: string; name: string; price: number; active: boolean }

type ClassType = "GROUP" | "KIDS" | "PRIVATE"

type Slot = {
  id: string
  date: string
  startTime: string
  endTime: string
  classType: ClassType
  publicVisible: boolean
  maxCapacity: number
  price: number
  seriesId: string | null
  trainer: Trainer | null
  assistant: Trainer | null
  _count: { bookings: number }
}

type StudioPrices = {
  groupPrice: number
  kidsPrice: number
  privatePrice: number
}

const CLASS_TYPES: { value: ClassType; label: string; sub: string }[] = [
  { value: "GROUP", label: "Group class", sub: "up to 6" },
  { value: "KIDS", label: "Kids class", sub: "up to 6" },
  { value: "PRIVATE", label: "Private", sub: "1 person" },
]

function priceForType(t: ClassType, p: StudioPrices) {
  return t === "GROUP" ? p.groupPrice : t === "KIDS" ? p.kidsPrice : p.privatePrice
}

function formatPriceShort(p: number) {
  if (p >= 1_000_000) {
    const m = p / 1_000_000
    const s = m % 1 === 0 ? m.toString() : m.toFixed(1).replace(/\.0$/, "")
    return `${s}M`
  }
  return `${Math.round(p / 1000)}k`
}

function defaultCapacityForType(t: ClassType) {
  return t === "PRIVATE" ? 1 : 6
}

type Booking = {
  id: string
  clientName: string
  clientPhone: string
  clientTelegram?: string | null
  status: string
  paymentType: string
  paymentStatus: string
  ticketCode?: string
  notes?: string | null
  services: { service: { id: string; name: string; price: number } }[]
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MAX_DOTS = 4
const TIME_PRESETS = ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00"]

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function computeEndTime(startTime: string) {
  const [h, m] = startTime.split(":").map(Number)
  const e = h * 60 + m + 120
  return `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`
}

const CLASS_DURATION = 120

function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function overlapsAny(candidate: string, otherStartTimes: string[]) {
  const c = timeToMin(candidate)
  for (const t of otherStartTimes) {
    if (t === candidate) continue
    if (Math.abs(timeToMin(t) - c) < CLASS_DURATION) return t
  }
  return null
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export default function BetaSchedulePage() {
  const today = useMemo(() => new Date(), [])
  const [monthAnchor, setMonthAnchor] = useState(startOfMonth(today))
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [slots, setSlots] = useState<Slot[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [studioPrices, setStudioPrices] = useState<StudioPrices | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null)
  const [creatingForDate, setCreatingForDate] = useState<string | null>(null)

  const monthChips = useMemo(() => {
    const arr: Date[] = []
    for (let i = -3; i <= 6; i++) arr.push(startOfMonth(addMonths(today, i)))
    return arr
  }, [today])

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn: 1 })
    const days: Date[] = []
    let d = start
    while (d <= end) { days.push(d); d = addDays(d, 1) }
    return days
  }, [monthAnchor])

  const fromStr = format(calendarDays[0], "yyyy-MM-dd")
  const toStr = format(calendarDays[calendarDays.length - 1], "yyyy-MM-dd")

  const fetchSlots = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/slots?from=${fromStr}&to=${toStr}`)
    if (res.ok) setSlots(await res.json())
    setLoading(false)
  }, [fromStr, toStr])

  const fetchTrainers = useCallback(async () => {
    const res = await fetch("/api/admin/trainers")
    if (res.ok) setTrainers(await res.json())
  }, [])

  const fetchServices = useCallback(async () => {
    const res = await fetch("/api/admin/services")
    if (res.ok) setServices(await res.json())
  }, [])

  useEffect(() => { fetchSlots() }, [fetchSlots])
  useEffect(() => { fetchTrainers(); fetchServices() }, [fetchTrainers, fetchServices])

  useEffect(() => {
    fetch("/api/admin/studio").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setStudioPrices({ groupPrice: d.groupPrice, kidsPrice: d.kidsPrice, privatePrice: d.privatePrice })
    })
  }, [])

  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of slots) {
      const list = map.get(s.date) ?? []
      list.push(s)
      map.set(s.date, list)
    }
    return map
  }, [slots])

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd")
  const selectedSlots = slotsByDate.get(selectedDateStr) ?? []

  const chipsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(`[data-month="${format(monthAnchor, "yyyy-MM")}"]`)
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
  }, [monthAnchor])

  const handleMonthChip = (date: Date) => {
    setMonthAnchor(startOfMonth(date))
    setSelectedDate(isSameMonth(date, today) ? today : startOfMonth(date))
  }

  const handleDayClick = (day: Date) => {
    setSelectedDate(day)
    if (!isSameMonth(day, monthAnchor)) setMonthAnchor(startOfMonth(day))
  }

  return (
    <div className="-mx-4 lg:mx-0">
      <div className="px-4 lg:px-0 flex items-center justify-between gap-3 mb-3">
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">
          Schedule
          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded align-middle">
            Beta
          </span>
        </h1>
        <button
          onClick={() => {
            setMonthAnchor(startOfMonth(today))
            setSelectedDate(today)
          }}
          className="text-sm font-medium text-gray-600 hover:text-[#2C6E49] px-3 py-1.5 rounded-lg hover:bg-gray-50 touch-manipulation"
        >
          Today
        </button>
      </div>

      <div className="px-2 lg:px-0">
        <div className="text-base lg:text-lg font-semibold text-gray-800 mb-2 px-2 lg:px-1">
          {format(monthAnchor, "MMMM yyyy")}
        </div>

        <div className="grid grid-cols-7">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] sm:text-xs font-medium text-gray-400 uppercase tracking-wider py-1.5">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd")
            const isToday = isSameDay(day, today)
            const isSelected = isSameDay(day, selectedDate)
            const isOtherMonth = !isSameMonth(day, monthAnchor)
            const daySlots = slotsByDate.get(dateStr) ?? []
            const dotColors = daySlots
              .map((s) => s.trainer?.color)
              .filter(Boolean) as string[]
            const visibleDots = dotColors.slice(0, MAX_DOTS)
            const overflow = dotColors.length - visibleDots.length

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => handleDayClick(day)}
                className="flex flex-col items-center pt-2 pb-2 touch-manipulation min-h-[64px]"
              >
                <span className={cn(
                  "flex items-center justify-center rounded-full text-sm sm:text-base font-medium",
                  "w-8 h-8 sm:w-9 sm:h-9",
                  isToday
                    ? "bg-[#2C6E49] text-white font-semibold"
                    : isSelected
                      ? "bg-[#2C6E49]/12 text-[#2C6E49] font-semibold"
                      : isOtherMonth
                        ? "text-gray-300"
                        : "text-gray-800",
                )}>
                  {day.getDate()}
                </span>
                <div className="mt-1 h-1.5 flex items-center justify-center gap-[3px]">
                  {visibleDots.map((c, i) => (
                    <span
                      key={i}
                      className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  {overflow > 0 && (
                    <span className="text-[8px] sm:text-[9px] font-bold text-gray-500 leading-none ml-[1px]">+</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Month chips */}
      <div className="mt-2 mb-4 overflow-x-auto px-2 lg:px-0" ref={chipsRef}>
        <div className="inline-flex items-center gap-1.5 min-w-full pb-1">
          {monthChips.map((m) => {
            const key = format(m, "yyyy-MM")
            const isActive = isSameMonth(m, monthAnchor)
            return (
              <button
                key={key}
                data-month={key}
                type="button"
                onClick={() => handleMonthChip(m)}
                className={cn(
                  "flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap touch-manipulation",
                  isActive
                    ? "bg-[#2C6E49]/12 text-[#2C6E49]"
                    : "bg-white border border-gray-200 text-gray-600"
                )}
              >
                {format(m, "MMM yyyy")}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day */}
      <div className="px-4 lg:px-0">
        <div className="flex gap-3 lg:gap-4">
          <div className="flex flex-col items-center flex-shrink-0 pt-1">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
              {format(selectedDate, "EEE")}
            </div>
            <div className={cn(
              "mt-1 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full text-base sm:text-lg font-semibold",
              isSameDay(selectedDate, today)
                ? "bg-[#2C6E49] text-white"
                : "bg-[#2C6E49]/12 text-[#2C6E49]"
            )}>
              {selectedDate.getDate()}
            </div>
          </div>

          <div className="flex-1 min-w-0 pb-6">
            {loading && selectedSlots.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {selectedSlots.map((slot) => {
                  const c = slot.trainer?.color ?? "#9CA3AF"
                  const seatsLeft = slot.maxCapacity - slot._count.bookings
                  const isFull = seatsLeft <= 0
                  const isHidden = !slot.publicVisible
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setEditingSlot(slot)}
                      className={cn(
                        "w-full text-left rounded-2xl px-4 py-3 touch-manipulation hover:opacity-90 relative",
                        isHidden && "border-2 border-dashed border-gray-300 opacity-70"
                      )}
                      style={{ backgroundColor: hexToRgba(c, isHidden ? 0.08 : 0.18) }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                          <span className="truncate">
                            {slot.trainer?.name ?? "Unassigned"}
                            {slot.assistant && ` · + ${slot.assistant.name}`}
                          </span>
                          {isHidden && (
                            <span className="inline-flex items-center gap-1 flex-shrink-0 px-1.5 py-0.5 rounded-full bg-white border border-gray-300 text-gray-600 text-[9px] font-bold uppercase tracking-wider leading-none">
                              <EyeOff size={10} strokeWidth={2.25} /> Hidden
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-gray-700 flex-shrink-0">
                          {slot._count.bookings}/{slot.maxCapacity}
                          {isFull && <span className="ml-1 text-rose-500">·</span>}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-2">
                        <span>{formatTime(slot.startTime)}–{formatTime(slot.endTime)}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          · {CLASS_TYPES.find((c) => c.value === slot.classType)?.label ?? slot.classType}
                        </span>
                        {isHidden && (
                          <span className="text-[10px] font-medium text-gray-500 italic">
                            · not visible to clients
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}

                <button
                  type="button"
                  onClick={() => setCreatingForDate(selectedDateStr)}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-[#2C6E49] bg-[#2C6E49]/5 border border-dashed border-[#2C6E49]/30 hover:bg-[#2C6E49]/10 touch-manipulation"
                >
                  <Plus size={16} />
                  Add session
                </button>
              </div>
            )}

            {/* Trainer legend */}
            {(() => {
              const trainersWithSlots = new Map<string, { name: string; color: string }>()
              for (const s of slots) {
                if (s.trainer) trainersWithSlots.set(s.trainer.id, { name: s.trainer.name, color: s.trainer.color })
              }
              if (trainersWithSlots.size === 0) return null
              return (
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-2">
                    Trainers this month
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(trainersWithSlots.values()).map((t) => (
                      <span key={t.name} className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {editingSlot && (
        <SlotEditor
          slot={editingSlot}
          trainers={trainers}
          services={services}
          studioPrices={studioPrices}
          onClose={() => setEditingSlot(null)}
          onChanged={() => { fetchSlots() }}
          onDeleted={() => { setEditingSlot(null); fetchSlots() }}
        />
      )}
      {creatingForDate && (
        <SlotCreator
          date={creatingForDate}
          trainers={trainers}
          existingSlots={slotsByDate.get(creatingForDate) ?? []}
          studioPrices={studioPrices}
          onClose={() => setCreatingForDate(null)}
          onCreated={() => { setCreatingForDate(null); fetchSlots() }}
        />
      )}
    </div>
  )
}

function SlotEditor({
  slot, trainers, services, studioPrices, onClose, onChanged, onDeleted,
}: {
  slot: Slot
  trainers: Trainer[]
  services: Service[]
  studioPrices: StudioPrices | null
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
}) {
  useBodyScrollLock(true)
  const [trainerId, setTrainerId] = useState(slot.trainer?.id ?? "")
  const [assistantId, setAssistantId] = useState(slot.assistant?.id ?? "")
  const [classType, setClassType] = useState<ClassType>(slot.classType)
  const [publicVisible, setPublicVisible] = useState<boolean>(slot.publicVisible)
  const [maxCapacity, setMaxCapacity] = useState(slot.maxCapacity)
  const [price, setPrice] = useState(slot.price)
  // Existing slot keeps the "Repeat weekly" toggle reflecting its current
  // series state. Unchecking it triggers an endSeries call on save, exactly
  // like /admin/schedule does.
  const [repeatWeekly, setRepeatWeekly] = useState<boolean>(!!slot.seriesId)
  const wasInSeries = !!slot.seriesId

  // When class type changes, auto-update capacity and (only if untouched) price
  const handleClassTypeChange = (next: ClassType) => {
    if (next === "PRIVATE" && slot._count.bookings >= 2) {
      const ok = confirm(`This session has ${slot._count.bookings} bookings. Private allows only 1 person — extra clients will be over capacity. Continue?`)
      if (!ok) return
    }
    setClassType(next)
    setMaxCapacity(defaultCapacityForType(next))
    if (studioPrices) setPrice(priceForType(next, studioPrices))
    // GROUP is always public; KIDS/PRIVATE keep current toggle state
    if (next === "GROUP") setPublicVisible(true)
  }
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loadingBookings, setLoadingBookings] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ clientName: "", clientPhone: "", clientTelegram: "" })

  const fetchBookings = useCallback(async () => {
    setLoadingBookings(true)
    const res = await fetch(`/api/admin/bookings?date=${slot.date}`)
    if (res.ok) {
      const all: Booking[] = await res.json()
      // We can only filter by slot id by re-fetching, but admin returns slot in include
      type WithSlot = Booking & { slot: { id: string } }
      const forThisSlot = (all as unknown as WithSlot[]).filter((b) => b.slot.id === slot.id && b.status === "CONFIRMED")
      setBookings(forThisSlot)
    }
    setLoadingBookings(false)
  }, [slot.date, slot.id])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  const handleSave = () => {
    // Optimistic — close immediately, fire in background, parent re-fetches
    onClose()
    const endSeries = wasInSeries && !repeatWeekly
    fetch(`/api/admin/slots?id=${slot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trainerId: trainerId || null,
        assistantId: assistantId || null,
        classType,
        publicVisible,
        maxCapacity: classType === "PRIVATE" ? 1 : Number(maxCapacity),
        price: Number(price),
        ...(endSeries ? { endSeries: true } : {}),
      }),
    }).finally(() => onChanged())
  }

  const handleDeleteSlot = () => {
    if (!confirm("Cancel this class? Confirmed bookings will remain in the database but the class is removed.")) return
    onDeleted()
    fetch(`/api/admin/slots?id=${slot.id}`, { method: "DELETE" }).finally(() => onChanged())
  }

  const handleCancelBooking = (b: Booking) => {
    if (!confirm(`Remove ${b.clientName} from this class?`)) return
    // Optimistic: remove from local state immediately
    setBookings((prev) => prev.filter((x) => x.id !== b.id))
    fetch(`/api/admin/bookings/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    }).finally(() => { fetchBookings(); onChanged() })
  }

  const handleAddBooking = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.clientName.trim() || !addForm.clientPhone.trim()) return
    const payload = {
      slotId: slot.id,
      clientName: addForm.clientName.trim(),
      clientPhone: addForm.clientPhone.trim(),
      clientTelegram: addForm.clientTelegram.trim() || undefined,
      partySize: 1,
    }
    // Optimistic — clear the form, add a placeholder row, sync in background
    const tempId = `tmp-${Date.now()}`
    setBookings((prev) => [...prev, {
      id: tempId,
      clientName: payload.clientName,
      clientPhone: payload.clientPhone,
      clientTelegram: payload.clientTelegram ?? null,
      status: "CONFIRMED",
      paymentType: "PENDING",
      paymentStatus: "UNPAID",
      services: [],
    }])
    setAddForm({ clientName: "", clientPhone: "", clientTelegram: "" })
    setAdding(false)
    fetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(async (res) => {
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setError(e.error ?? "Failed to add")
      }
    }).finally(() => { fetchBookings(); onChanged() })
  }

  void services

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 touch-none"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Edit class</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {format(new Date(slot.date + "T00:00:00"), "EEEE, MMM d")} · {formatTime(slot.startTime)}–{formatTime(slot.endTime)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
          {/* Slot fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Class type</label>
              <div className="grid grid-cols-3 gap-1.5">
                {CLASS_TYPES.map((c) => {
                  const p = studioPrices ? priceForType(c.value, studioPrices) : 0
                  return (
                    <button key={c.value} type="button" onClick={() => handleClassTypeChange(c.value)}
                      className={cn("rounded-lg border px-3 py-2 text-left touch-manipulation",
                        classType === c.value ? "border-[#2C6E49] bg-[#2C6E49]/5" : "border-gray-200 bg-white"
                      )}>
                      <div className={cn("text-xs font-semibold", classType === c.value ? "text-[#2C6E49]" : "text-gray-700")}>
                        {c.label}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{c.sub}</div>
                      {studioPrices && (
                        <div className={cn("text-[11px] font-bold mt-1", classType === c.value ? "text-[#2C6E49]" : "text-gray-600")}>
                          {formatPriceShort(p)} IDR
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Trainer & capacity</label>
              <div className="flex gap-2">
                <select value={trainerId} onChange={(e) => { setTrainerId(e.target.value); if (!e.target.value) setAssistantId("") }}
                  className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30">
                  <option value="">Unassigned</option>
                  {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select
                  value={classType === "PRIVATE" ? 1 : maxCapacity}
                  disabled={classType === "PRIVATE"}
                  onChange={(e) => setMaxCapacity(Number(e.target.value))}
                  title={classType === "PRIVATE" ? "Private session is always 1 person" : "Capacity"}
                  className="w-[88px] border border-gray-200 rounded-xl px-2 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 disabled:opacity-60 disabled:bg-gray-50"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>👤 {n}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Assistant <span className="text-gray-400">(optional)</span></label>
              <select value={assistantId} disabled={!trainerId}
                onChange={(e) => setAssistantId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 disabled:opacity-50">
                <option value="">None</option>
                {trainers.filter((t) => t.id !== trainerId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {(classType === "KIDS" || classType === "PRIVATE") && (
              <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 cursor-pointer touch-manipulation">
                <input
                  type="checkbox"
                  checked={publicVisible}
                  onChange={(e) => setPublicVisible(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-[#2C6E49]"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800">Show in public schedule</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {publicVisible
                      ? "Clients will see this as a " + (classType === "KIDS" ? "Kids" : "Private") + " class and can book it."
                      : "Hidden from clients. Visible only to admin and trainer."}
                  </div>
                </div>
              </label>
            )}

            {(() => {
              const weekday = format(new Date(slot.date + "T00:00:00"), "EEEE")
              const showWarning = wasInSeries && !repeatWeekly
              return (
                <label className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer touch-manipulation",
                  repeatWeekly
                    ? "bg-[#2C6E49]/5 border-[#2C6E49]/20"
                    : "bg-gray-50 border-gray-200"
                )}>
                  <input
                    type="checkbox"
                    checked={repeatWeekly}
                    onChange={(e) => setRepeatWeekly(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-[#2C6E49]"
                  />
                  <div className="min-w-0">
                    <div className={cn(
                      "text-sm font-medium",
                      repeatWeekly ? "text-[#2C6E49]" : "text-gray-700"
                    )}>
                      Repeat every {weekday}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {showWarning
                        ? "Unchecking stops the series — future occurrences will be removed."
                        : wasInSeries
                          ? "Part of a weekly series — this trainer covers every " + weekday + "."
                          : "Currently one-off. Turning on won't backfill past weeks."}
                    </div>
                  </div>
                </label>
              )
            })()}
          </div>

          {/* Bookings */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-gray-500">
                Clients ({bookings.length}/{maxCapacity})
              </div>
              {!adding && bookings.length < maxCapacity && (
                <button type="button" onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2C6E49] hover:underline">
                  <Plus size={12} /> Add client
                </button>
              )}
            </div>

            {loadingBookings ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : bookings.length === 0 && !adding ? (
              <div className="text-xs text-gray-400 py-3">No clients booked yet</div>
            ) : (
              <div className="space-y-1.5">
                {bookings.map((b) => {
                  const wa = whatsappLink(b.clientPhone, `Hi ${b.clientName.replace(/\s*\(\d+\/\d+\)$/, "")}!`)
                  return (
                    <div key={b.id} className="flex items-center gap-2 rounded-lg px-3 py-2 border border-gray-100">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-800 truncate">{b.clientName}</div>
                        {wa ? (
                          <a href={wa} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#25D366]">
                            <WhatsAppIcon size={11} />
                            {b.clientPhone}
                          </a>
                        ) : (
                          <div className="text-xs text-gray-500">{b.clientPhone}</div>
                        )}
                      </div>
                      <button type="button" onClick={() => handleCancelBooking(b)} title="Remove"
                        className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-md">
                        <X size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {adding && (
              <form onSubmit={handleAddBooking} className="mt-2 space-y-2 bg-gray-50 rounded-xl p-3">
                <input type="text" required placeholder="Client name"
                  value={addForm.clientName}
                  onChange={(e) => setAddForm({ ...addForm, clientName: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
                />
                <input type="tel" required placeholder="Phone, e.g. +62..."
                  value={addForm.clientPhone}
                  onChange={(e) => setAddForm({ ...addForm, clientPhone: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
                />
                <input type="text" placeholder="Telegram (optional)"
                  value={addForm.clientTelegram}
                  onChange={(e) => setAddForm({ ...addForm, clientTelegram: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAdding(false)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-white">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-[#2C6E49] text-white hover:bg-[#1E4D34] disabled:opacity-60">
                    {saving ? "Adding…" : "Add client"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}
        </div>

        <div className="px-5 py-3 flex items-center gap-2 flex-shrink-0 border-t border-gray-100">
          <button type="button" onClick={handleDeleteSlot} disabled={saving}
            className="px-3 py-2.5 rounded-xl border border-rose-200 text-rose-500 text-sm font-medium hover:bg-rose-50 disabled:opacity-50">
            <Trash2 size={14} />
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            Close
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 px-3 py-2.5 rounded-xl bg-[#2C6E49] text-white text-sm font-semibold hover:bg-[#1E4D34] disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}

type Assignment = { trainerId: string; assistantId: string; classType: ClassType; publicVisible: boolean; maxCapacity: number; repeatWeekly: boolean }

function sortTimes(arr: string[]) {
  return [...new Set(arr)].sort()
}

function SlotCreator({
  date, trainers, existingSlots, studioPrices, onClose, onCreated,
}: {
  date: string
  trainers: Trainer[]
  existingSlots: Slot[]
  studioPrices: StudioPrices | null
  onClose: () => void
  onCreated: () => void
}) {
  useBodyScrollLock(true)

  const initialTimes = useMemo(
    () => sortTimes(existingSlots.map((s) => s.startTime)),
    [existingSlots]
  )
  const initialAssignments = useMemo(() => {
    const m: Record<string, Assignment> = {}
    for (const s of existingSlots) {
      m[s.startTime] = {
        trainerId: s.trainer?.id ?? "",
        assistantId: s.assistant?.id ?? "",
        classType: s.classType,
        publicVisible: s.publicVisible,
        maxCapacity: s.maxCapacity ?? 6,
        repeatWeekly: !!s.seriesId,
      }
    }
    return m
  }, [existingSlots])

  const [startTimes, setStartTimes] = useState<string[]>(initialTimes)
  const [assignments, setAssignments] = useState<Record<string, Assignment>>(initialAssignments)
  const [customTime, setCustomTime] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const existingByTime = useMemo(() => {
    const m = new Map<string, Slot>()
    for (const s of existingSlots) m.set(s.startTime, s)
    return m
  }, [existingSlots])

  const toggleTime = (t: string) => {
    setError("")
    setStartTimes((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t)
      const conflict = overlapsAny(t, prev)
      if (conflict) {
        setError(`${formatTime(t)} overlaps with ${formatTime(conflict)}–${formatTime(computeEndTime(conflict))} (classes are 2h long)`)
        return prev
      }
      return sortTimes([...prev, t])
    })
    setAssignments((prev) => {
      if (prev[t]) return prev
      return { ...prev, [t]: { trainerId: "", assistantId: "", classType: "GROUP", publicVisible: true, maxCapacity: 6, repeatWeekly: true } }
    })
  }

  const updateAssignment = (t: string, change: Partial<Assignment>) => {
    setAssignments((prev) => ({
      ...prev,
      [t]: { ...(prev[t] ?? { trainerId: "", assistantId: "", classType: "GROUP", publicVisible: true, maxCapacity: 6, repeatWeekly: true }), ...change },
    }))
  }

  const handleSave = () => {
    setError("")
    const desired = new Set(startTimes)
    const toDelete = existingSlots.filter((s) => !desired.has(s.startTime))
    const toCreate = startTimes.filter((t) => !existingByTime.has(t))

    type Req = { url: string; method: "POST" | "PATCH" | "DELETE"; body?: unknown; label: string }
    const payloads: Req[] = []

    for (const s of toDelete) {
      payloads.push({ url: `/api/admin/slots?id=${s.id}`, method: "DELETE", label: `delete ${s.startTime}` })
    }

    for (const t of startTimes) {
      const slot = existingByTime.get(t)
      if (!slot) continue
      const a = assignments[t] ?? { trainerId: "", assistantId: "", classType: "GROUP" as ClassType, publicVisible: true, maxCapacity: 6, repeatWeekly: true }
      const curT = slot.trainer?.id ?? ""
      const curA = slot.assistant?.id ?? ""
      const curType = slot.classType
      const curVis = slot.publicVisible
      const curCap = slot.maxCapacity ?? 6
      const desiredCap = a.classType === "PRIVATE" ? 1 : a.maxCapacity
      const endSeries = !!slot.seriesId && !a.repeatWeekly
      const fieldChanged =
        a.trainerId !== curT ||
        a.assistantId !== curA ||
        a.classType !== curType ||
        a.publicVisible !== curVis ||
        desiredCap !== curCap
      if (fieldChanged || endSeries) {
        payloads.push({
          url: `/api/admin/slots?id=${slot.id}`,
          method: "PATCH",
          label: `update ${t}`,
          body: {
            trainerId: a.trainerId || null,
            assistantId: a.assistantId || null,
            classType: a.classType,
            publicVisible: a.publicVisible,
            maxCapacity: desiredCap,
            price: studioPrices ? priceForType(a.classType, studioPrices) : slot.price,
            ...(endSeries ? { endSeries: true } : {}),
          },
        })
      }
    }

    for (const startTime of toCreate) {
      const a = assignments[startTime] ?? { trainerId: "", assistantId: "", classType: "GROUP" as ClassType, publicVisible: true, maxCapacity: 6, repeatWeekly: true }
      const isPrivate = a.classType === "PRIVATE"
      payloads.push({
        url: "/api/admin/slots",
        method: "POST",
        label: `create ${startTime}`,
        body: {
          date,
          startTime,
          trainerId: a.trainerId || undefined,
          assistantId: a.assistantId || null,
          classType: a.classType,
          publicVisible: a.publicVisible,
          maxCapacity: isPrivate ? 1 : Number(a.maxCapacity),
          price: studioPrices ? priceForType(a.classType, studioPrices) : 0,
          repeatWeekly: a.repeatWeekly,
        },
      })
    }

    if (payloads.length === 0) {
      onClose()
      return
    }

    // Optimistic — close immediately, fire requests in the background
    onClose()
    Promise.allSettled(
      payloads.map((p) =>
        fetch(p.url, {
          method: p.method,
          ...(p.body !== undefined && {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p.body),
          }),
        }),
      ),
    ).finally(() => onCreated())
  }

  const counts = useMemo(() => {
    const desired = new Set(startTimes)
    const toCreate = startTimes.filter((t) => !existingByTime.has(t)).length
    const toDelete = existingSlots.filter((s) => !desired.has(s.startTime)).length
    let toUpdate = 0
    for (const t of startTimes) {
      const slot = existingByTime.get(t)
      if (!slot) continue
      const a = assignments[t] ?? { trainerId: "", assistantId: "", classType: "GROUP" as ClassType, publicVisible: true, maxCapacity: 6, repeatWeekly: true }
      const desiredCap = a.classType === "PRIVATE" ? 1 : a.maxCapacity
      if (
        a.trainerId !== (slot.trainer?.id ?? "") ||
        a.assistantId !== (slot.assistant?.id ?? "") ||
        a.classType !== slot.classType ||
        a.publicVisible !== slot.publicVisible ||
        desiredCap !== (slot.maxCapacity ?? 6)
      ) toUpdate++
    }
    return { toCreate, toDelete, toUpdate }
  }, [startTimes, assignments, existingByTime, existingSlots])

  const hasChanges = counts.toCreate > 0 || counts.toDelete > 0 || counts.toUpdate > 0
  const saveLabel = (() => {
    if (saving) return "Saving…"
    if (!hasChanges) return "Save"
    const parts: string[] = []
    if (counts.toCreate > 0) parts.push(`+${counts.toCreate}`)
    if (counts.toDelete > 0) parts.push(`−${counts.toDelete}`)
    if (counts.toUpdate > 0) parts.push(`~${counts.toUpdate}`)
    return `Save (${parts.join(" / ")})`
  })()

  const title = existingSlots.length > 0 ? "Manage day's sessions" : "Add sessions"

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 touch-none"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{format(new Date(date + "T00:00:00"), "EEEE, MMM d")}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2.5 rounded-xl flex items-start gap-2">
              <span className="text-base leading-none">⚠</span>
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError("")} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session times</label>
            <p className="text-xs text-gray-400 mb-2">Pick one or more — each creates a separate session (+120 min). Times within 2h of an existing one are locked.</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TIME_PRESETS.map((t) => {
                const selected = startTimes.includes(t)
                const conflictWith = !selected ? overlapsAny(t, startTimes) : null
                const disabled = !!conflictWith
                return (
                  <button key={t} type="button"
                    disabled={disabled}
                    title={disabled && conflictWith ? `Conflicts with ${formatTime(conflictWith)}` : undefined}
                    onClick={() => toggleTime(t)}
                    className={cn("px-2.5 py-1 text-xs rounded-lg border font-medium touch-manipulation",
                      selected
                        ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                        : disabled
                          ? "bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed line-through"
                          : "bg-white text-gray-600 border-gray-200"
                    )}>
                    {formatTime(t)}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <input type="time" value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
              />
              <button type="button"
                onClick={() => {
                  if (!customTime) return
                  if (startTimes.includes(customTime)) {
                    setError(`${formatTime(customTime)} is already in the list`)
                    return
                  }
                  const conflict = overlapsAny(customTime, startTimes)
                  if (conflict) {
                    setError(`${formatTime(customTime)} overlaps with ${formatTime(conflict)}–${formatTime(computeEndTime(conflict))} (classes are 2h long)`)
                    return
                  }
                  toggleTime(customTime)
                  setCustomTime("")
                }}
                className="px-4 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700">
                + Add
              </button>
            </div>
          </div>

          {/* Per-time rows */}
          {(() => {
            const existingTimes = new Set(existingSlots.map((s) => s.startTime))
            const desiredSet = new Set(startTimes)
            const removed = existingSlots.filter((s) => !desiredSet.has(s.startTime))
            if (startTimes.length === 0 && removed.length === 0) return null
            return (
              <div className="space-y-2">
                {startTimes.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5">Sessions ({startTimes.length}):</div>
                    <div className="space-y-1.5">
                      {startTimes.map((t) => {
                        const isExisting = existingTimes.has(t)
                        const a = assignments[t] ?? { trainerId: "", assistantId: "", classType: "GROUP" as ClassType, publicVisible: true, maxCapacity: 6, repeatWeekly: true }
                        const existingSlotForTime = isExisting ? existingSlots.find((s) => s.startTime === t) : null
                        const bookingCount = existingSlotForTime?._count.bookings ?? 0
                        const hasBookings = bookingCount > 0
                        return (
                          <div key={t} className={cn(
                            "relative rounded-lg text-xs border pl-3 pr-10 py-2.5 space-y-2",
                            isExisting ? "bg-gray-50 border-gray-200" : "bg-[#2C6E49]/5 border-[#2C6E49]/15"
                          )}>
                            <button type="button"
                              disabled={hasBookings}
                              onClick={() => toggleTime(t)}
                              title={hasBookings
                                ? `Has ${bookingCount} booking${bookingCount === 1 ? "" : "s"} — cancel them first or hide the session instead`
                                : isExisting ? "Remove this session" : "Discard this new session"}
                              aria-label="Remove session"
                              className={cn(
                                "absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center text-lg leading-none touch-manipulation",
                                hasBookings ? "text-gray-300 cursor-not-allowed" :
                                  isExisting ? "text-gray-400 hover:text-rose-600 hover:bg-rose-50" : "text-[#2C6E49]/60 hover:text-rose-600 hover:bg-rose-50"
                              )}>×</button>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn("font-medium whitespace-nowrap",
                                isExisting ? "text-gray-700" : "text-[#2C6E49]"
                              )}>
                                {formatTime(t)}–{formatTime(computeEndTime(t))}
                              </span>
                              <div className="ml-auto flex gap-1">
                                {CLASS_TYPES.map((c) => {
                                  const wasPrivate = a.classType === "PRIVATE"
                                  return (
                                    <button key={c.value} type="button"
                                      onClick={() => {
                                        if (c.value === "PRIVATE") {
                                          if (bookingCount >= 2) {
                                            const ok = confirm(`This session has ${bookingCount} bookings. Private allows only 1 person — extra clients will be over capacity. Continue?`)
                                            if (!ok) return
                                          }
                                          updateAssignment(t, { classType: c.value, maxCapacity: 1 })
                                        } else if (c.value === "GROUP") {
                                          updateAssignment(t, {
                                            classType: c.value,
                                            publicVisible: true,
                                            maxCapacity: wasPrivate ? 6 : a.maxCapacity,
                                          })
                                        } else {
                                          updateAssignment(t, {
                                            classType: c.value,
                                            maxCapacity: wasPrivate ? 6 : a.maxCapacity,
                                          })
                                        }
                                      }}
                                      title={c.label}
                                      className={cn(
                                        "w-7 h-7 rounded text-[11px] font-bold leading-none flex items-center justify-center border touch-manipulation",
                                        a.classType === c.value
                                          ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                                          : "bg-white text-gray-500 border-gray-200"
                                      )}>
                                      {c.value[0]}
                                    </button>
                                  )
                                })}
                              </div>
                              {(a.classType === "KIDS" || a.classType === "PRIVATE") && (
                                <>
                                  <span className="w-px h-5 bg-gray-300/60 flex-shrink-0" aria-hidden />
                                  <button type="button"
                                    onClick={() => updateAssignment(t, { publicVisible: !a.publicVisible })}
                                    title={a.publicVisible ? "Visible to clients — tap to hide" : "Hidden from clients — tap to show"}
                                    className={cn(
                                      "w-7 h-7 rounded flex items-center justify-center border touch-manipulation",
                                      a.publicVisible
                                        ? "bg-white text-[#2C6E49] border-[#2C6E49]/40"
                                        : "bg-gray-50 text-gray-400 border-gray-200"
                                    )}>
                                    {a.publicVisible
                                      ? <Eye size={14} strokeWidth={2.25} />
                                      : <EyeOff size={14} strokeWidth={2.25} />}
                                  </button>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                value={a.trainerId}
                                onChange={(e) => updateAssignment(t, { trainerId: e.target.value, assistantId: e.target.value ? a.assistantId : "" })}
                                className="flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#2C6E49]/30"
                              >
                                <option value="">Unassigned</option>
                                {trainers.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                              </select>
                              {a.trainerId && (
                                <select
                                  value={a.assistantId}
                                  onChange={(e) => updateAssignment(t, { assistantId: e.target.value })}
                                  className="flex-1 min-w-0 text-xs border border-dashed border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#2C6E49]/30 text-gray-500"
                                  title="Assistant"
                                >
                                  <option value="">+ Asst</option>
                                  {trainers.filter((tr) => tr.id !== a.trainerId).map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                                </select>
                              )}
                              <span className="w-px h-5 bg-gray-300/60 flex-shrink-0" aria-hidden />
                              {(() => {
                                const isPrivate = a.classType === "PRIVATE"
                                return (
                                  <select
                                    value={isPrivate ? 1 : a.maxCapacity}
                                    disabled={isPrivate}
                                    onChange={(e) => updateAssignment(t, { maxCapacity: Number(e.target.value) })}
                                    title={isPrivate ? "Private session is always 1 person" : "Capacity"}
                                    className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#2C6E49]/30 disabled:opacity-60 disabled:bg-gray-50 flex-shrink-0"
                                  >
                                    {[1, 2, 3, 4, 5, 6].map((n) => (
                                      <option key={n} value={n}>👤 {n}</option>
                                    ))}
                                  </select>
                                )
                              })()}
                              {hasBookings && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold leading-none whitespace-nowrap flex-shrink-0"
                                  title={`${bookingCount} confirmed booking${bookingCount === 1 ? "" : "s"} — session can't be removed`}
                                >
                                  🔒 {bookingCount}
                                </span>
                              )}
                            </div>
                            {(() => {
                              const weekday = format(new Date(date + "T00:00:00"), "EEEE")
                              const isPartOfSeries = isExisting && !!existingSlotForTime?.seriesId
                              const showWarning = isPartOfSeries && !a.repeatWeekly
                              return (
                                <label className={cn(
                                  "flex items-start gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 transition-colors",
                                  a.repeatWeekly
                                    ? "bg-[#2C6E49]/5 hover:bg-[#2C6E49]/10"
                                    : "bg-gray-50 hover:bg-gray-100"
                                )}>
                                  <input type="checkbox"
                                    checked={a.repeatWeekly}
                                    onChange={(e) => updateAssignment(t, { repeatWeekly: e.target.checked })}
                                    className="w-4 h-4 mt-0.5 accent-[#2C6E49] flex-shrink-0"
                                  />
                                  <div className="min-w-0 flex-1 leading-tight">
                                    <div className={cn(
                                      "text-[11px] font-medium",
                                      a.repeatWeekly ? "text-[#2C6E49]" : "text-gray-600"
                                    )}>
                                      Repeat every {weekday}
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                      {showWarning
                                        ? "Unchecking stops the series — future occurrences will be removed"
                                        : isPartOfSeries
                                          ? "Part of a weekly series"
                                          : isExisting
                                            ? "Currently one-off (turning on won't backfill past weeks)"
                                            : `Also schedule the next 12 ${weekday}s`}
                                    </div>
                                  </div>
                                </label>
                              )
                            })()}
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
                          <button type="button" onClick={() => toggleTime(s.startTime)}
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

        <div className="px-5 py-3 flex gap-2 flex-shrink-0 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !hasChanges}
            className="flex-1 px-3 py-2.5 rounded-xl bg-[#2C6E49] text-white text-sm font-semibold hover:bg-[#1E4D34] disabled:opacity-60">
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
