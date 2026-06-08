"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { format, addDays, startOfWeek, endOfWeek, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, X, Lock, Unlock, Copy, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import { ClientBookingRow } from "@/app/_components/ClientBookingRow"
import { AddClientForm, type NewClient } from "@/app/_components/AddClientForm"
import { QueuedClients } from "@/app/_components/QueuedClients"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { useOpenChat } from "@/lib/use-open-chat"

type View = "week" | "2weeks" | "month"
type Trainer = { id: string; name: string; color: string }
type Slot = {
  id: string; date: string; startTime: string; endTime: string
  classType: string
  publicVisible: boolean
  maxCapacity: number; price: number
  seriesId: string | null
  trainer: { id: string; name: string; color: string } | null
  assistant: { id: string; name: string; color: string } | null
  _count: { bookings: number }
}
type BlockedDay = { id: string; date: string; reason: string | null }

const TIME_PRESETS = ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00"]
const VIEW_LABELS: Record<View, string> = { week: "Week", "2weeks": "2 Weeks", month: "Month" }

// 24-hour format: 07:00, 13:00, 19:00 etc. Admin always sees 24h.
function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function computeEndTime(startTime: string) {
  const [h, m] = startTime.split(":").map(Number)
  const e = h * 60 + m + 120
  return `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`
}

const CLASS_DURATION = 120 // minutes, matches the server

function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

// Two classes overlap if their [start, start+120) intervals intersect.
// Equivalently: their start times are < 120 min apart.
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

function slotCardStyle(slot: Slot) {
  if (!slot.trainer) return {}
  // No one booked yet → show the assigned trainer's color faded. Once a client
  // books, the card lights up in the trainer's full, vivid color.
  const hasBookings = slot._count.bookings > 0
  if (hasBookings) {
    return {
      backgroundColor: slot.trainer.color,
      borderColor: slot.trainer.color,
    }
  }
  return {
    backgroundColor: hexToRgba(slot.trainer.color, 0.12),
    borderColor: hexToRgba(slot.trainer.color, 0.45),
  }
}

type SlotAssignment = { trainerId: string; assistantId: string; classType: ClassType; publicVisible: boolean; maxCapacity: number; repeatWeekly: boolean; clients?: NewClient[] }
type ClassType = "GROUP" | "KIDS" | "PRIVATE"

const CLASS_TYPES: { value: ClassType; label: string; sub: string }[] = [
  { value: "GROUP", label: "Group class", sub: "up to 6" },
  { value: "KIDS", label: "Kids class", sub: "up to 6" },
  { value: "PRIVATE", label: "Private", sub: "1 person" },
]

const EMPTY_FORM = {
  date: format(new Date(), "yyyy-MM-dd"),
  startTime: "10:00",
  startTimes: [] as string[],
  customTime: "10:00",
  trainerId: "",
  assistantId: "",
  classType: "GROUP" as ClassType,
  publicVisible: true,
  maxCapacity: 6,
  price: 300000,
  assignments: {} as Record<string, SlotAssignment>,
}

function sortTimes(times: string[]) {
  return [...new Set(times)].sort()
}

// Per-class client list shown inside the day editor: who's registered, with
// the option to move a client to another class/day or cancel their booking.
function SlotClientList({
  slot,
  allSlots,
  onChanged,
  canAdd = true,
}: {
  slot: Slot
  allSlots: Slot[]
  onChanged: () => void
  canAdd?: boolean
}) {
  type Booking = { id: string; clientName: string; clientPhone: string; status: string; paymentStatus: string; slot: { id: string } }
  const [list, setList] = useState<Booking[] | null>(null)
  const [adding, setAdding] = useState(false)
  const { openChat } = useOpenChat()

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/bookings?date=${slot.date}`)
    if (!res.ok) { setList([]); return }
    const all: Booking[] = await res.json()
    setList(all.filter((b) => b.slot?.id === slot.id && b.status === "CONFIRMED"))
  }, [slot.date, slot.id])
  useEffect(() => { load() }, [load])

  const cancel = async (b: Booking) => {
    if (!confirm(`Cancel ${b.clientName}'s booking?`)) return
    setList((prev) => prev?.filter((x) => x.id !== b.id) ?? null)
    try {
      const res = await fetch(`/api/admin/bookings/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert(e.error ?? "Couldn't remove the client. Please try again.")
        load() // Revert optimistic update
      }
    } catch {
      alert("Network error — couldn't remove the client. Please try again.")
      load()
    } finally {
      onChanged()
    }
  }

  const move = async (b: Booking, targetSlotId: string) => {
    setList((prev) => prev?.filter((x) => x.id !== b.id) ?? null)
    const res = await fetch(`/api/admin/bookings/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: targetSlotId }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      alert(e.error ?? "Couldn't move the booking.")
      load()
    }
    onChanged()
  }

  const handleAdd = (c: NewClient) => {
    setAdding(false)
    const party = Math.max(1, Math.min(seatsLeft, c.partySize || 1))
    setList((prev) => [
      ...(prev ?? []),
      ...Array.from({ length: party }, (_, i) => ({
        id: `tmp-${Date.now()}-${i}`,
        clientName: party > 1 ? `${c.clientName} (${i + 1}/${party})` : c.clientName,
        clientPhone: c.clientPhone,
        status: "CONFIRMED",
        paymentStatus: "UNPAID",
        slot: { id: slot.id },
      })),
    ])
    fetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: slot.id,
        clientName: c.clientName,
        clientPhone: c.clientPhone,
        clientEmail: c.clientEmail || undefined,
        clientTelegram: c.clientTelegram || undefined,
        partySize: party,
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert(e.error ?? "Couldn't add the client.")
      }
    }).finally(() => { load(); onChanged() })
  }

  // Other classes with a free seat, sorted by date/time.
  const targets = allSlots
    .filter((s) => s.id !== slot.id && s.maxCapacity - s._count.bookings > 0)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))

  if (list === null) return <div className="text-[11px] text-gray-400 mt-2">Loading clients…</div>

  const targetOptions = targets.map((t) => ({
    id: t.id,
    label: `${format(new Date(t.date + "T00:00:00"), "MMM d")} · ${formatTime(t.startTime)}`,
  }))
  const seatsLeft = slot.maxCapacity - list.length

  return (
    <div className="mt-2 border-t border-gray-200 pt-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-gray-400">Clients ({list.length}/{slot.maxCapacity})</div>
        {!adding && seatsLeft > 0 && canAdd && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2C6E49] hover:underline"
          >
            <Plus size={12} /> Add client
          </button>
        )}
        {!adding && seatsLeft > 0 && !canAdd && (
          <span className="text-[10px] text-gray-400">Assign a trainer first</span>
        )}
      </div>
      {list.map((b) => (
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
      ))}
      {adding && <AddClientForm onSubmit={handleAdd} onCancel={() => setAdding(false)} maxParty={seatsLeft} />}
    </div>
  )
}

export default function SchedulePage() {
  const [view, setView] = useState<View>("week")
  // For Week view, anchor = the actual first visible day (defaults to today).
  // For 2weeks, anchor = Monday of the current week.
  // For Month, anchor = any day within the visible month.
  const [anchor, setAnchor] = useState<Date>(new Date())

  // Reset anchor whenever the view mode changes so it matches that view's
  // semantics — keeps Prev/Next behaving correctly across switches.
  const lastViewRef = useRef<View>(view)
  useEffect(() => {
    if (lastViewRef.current === view) return
    lastViewRef.current = view
    if (view === "week") setAnchor(new Date())
    else if (view === "2weeks") setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))
    else setAnchor(startOfMonth(new Date()))
  }, [view])
  const [slots, setSlots] = useState<Slot[]>([])
  // False until the first slots fetch resolves — show the petal spinner
  // instead of an empty grid that looks frozen on mobile.
  const [slotsLoaded, setSlotsLoaded] = useState(false)
  const [blockedDays, setBlockedDays] = useState<BlockedDay[]>([])
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [studioPrices, setStudioPrices] = useState<{ groupPrice: number; kidsPrice: number; privatePrice: number } | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modal, setModal] = useState<null | "create" | Slot>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState("")
  const [syncError, setSyncError] = useState<string | null>(null)
  const [blockModal, setBlockModal] = useState<{ date: string; existing?: BlockedDay } | null>(null)
  const [blockReason, setBlockReason] = useState("")
  type CopyPlan = { weekIndex: number; targetStart: Date; toCopy: Slot[]; skipped: number }
  const [copyModal, setCopyModal] = useState<null | {
    sourceStart: Date
    sourceSlots: Slot[]
    weeksAhead: number
    plans: CopyPlan[]
    loading: boolean
    running: boolean
  }>(null)

  // Lock background scroll while any modal is open (iOS-safe)
  useBodyScrollLock(modal !== null || blockModal !== null || copyModal !== null)

  const todayStr = format(new Date(), "yyyy-MM-dd")

  const days = useMemo(() => {
    if (view === "week") {
      // 7 days starting from `anchor` (defaults to today; Prev/Next shift by 7)
      return Array.from({ length: 7 }, (_, i) => addDays(anchor, i))
    }
    if (view === "2weeks") return Array.from({ length: 14 }, (_, i) => addDays(anchor, i))
    // Month view: full calendar grid so weekday columns line up with headers
    const mStart = startOfMonth(anchor)
    const mEnd = endOfMonth(anchor)
    const gridStart = startOfWeek(mStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(mEnd, { weekStartsOn: 1 })
    const r: Date[] = []; let d = gridStart
    while (d <= gridEnd) { r.push(d); d = addDays(d, 1) }
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
    const res = await fetch(`/api/admin/slots?from=${from}&to=${to}`, { cache: "no-store" })
    setSlots(await res.json())
    setSlotsLoaded(true)
  }, [from, to])

  const fetchBlocked = useCallback(async () => {
    const res = await fetch(`/api/admin/blocked-days?from=${from}&to=${to}`, { cache: "no-store" })
    setBlockedDays(await res.json())
  }, [from, to])

  const fetchTrainers = useCallback(async () => {
    const res = await fetch("/api/admin/trainers")
    setTrainers(await res.json())
  }, [])

  useEffect(() => { fetchSlots() }, [fetchSlots])
  useEffect(() => { fetchBlocked() }, [fetchBlocked])
  useEffect(() => { fetchTrainers() }, [fetchTrainers])
  useEffect(() => {
    fetch("/api/admin/studio").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setStudioPrices({ groupPrice: d.groupPrice, kidsPrice: d.kidsPrice, privatePrice: d.privatePrice })
    })
  }, [])

  const priceForType = (t: ClassType) => {
    if (!studioPrices) return 0
    return t === "GROUP" ? studioPrices.groupPrice : t === "KIDS" ? studioPrices.kidsPrice : studioPrices.privatePrice
  }
  const formatPriceShort = (p: number) => {
    if (p >= 1_000_000) {
      const m = p / 1_000_000
      const s = m % 1 === 0 ? m.toString() : m.toFixed(1).replace(/\.0$/, "")
      return `${s}M`
    }
    return `${Math.round(p / 1000)}k`
  }

  const openCreate = (date: string) => {
    const bd = blockedDays.find((b) => b.date === date)
    if (bd) return
    setSelectedDate(date)
    // Pre-fill startTimes with existing slot times for that date so the form acts as
    // a "manage day's sessions" view (toggle to add or remove).
    const existing = slots.filter((s) => s.date === date)
    const existingTimes = sortTimes(existing.map((s) => s.startTime))
    const initialAssignments: Record<string, SlotAssignment> = {}
    existing.forEach((s) => {
      initialAssignments[s.startTime] = {
        trainerId: s.trainer?.id ?? "",
        assistantId: s.assistant?.id ?? "",
        classType: (s.classType as ClassType) ?? "GROUP",
        publicVisible: s.publicVisible ?? true,
        maxCapacity: s.maxCapacity ?? 6,
        repeatWeekly: !!s.seriesId,
      }
    })
    setForm({ ...EMPTY_FORM, date, startTimes: existingTimes, assignments: initialAssignments })
    setFormError("")
    setModal("create")
  }

  const closeModal = () => { setModal(null); setFormError("") }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError("")

    type Req = { url: string; method: "POST" | "PATCH" | "DELETE"; body?: unknown }
    const payloads: Req[] = []
    // New sessions are created via their own awaited routine (not the batch)
    // so we can read each created slot's id and then book any queued clients.
    const createSpecs: { startTime: string; body: Record<string, unknown>; clients: NewClient[] }[] = []

    const existing = slots.filter((s) => s.date === form.date)
    const existingByTime = new Map(existing.map((s) => [s.startTime, s] as const))
    const desired = new Set(form.startTimes)
    const toDelete = existing.filter((s) => !desired.has(s.startTime))
    const toCreate = form.startTimes.filter((t) => !existingByTime.has(t))

    const idsToDelete = new Set<string>()
    const optimisticUpdates = new Map<string, Slot>()
    const tempCreates: Slot[] = []

    for (const s of toDelete) {
      payloads.push({ url: `/api/admin/slots?id=${s.id}`, method: "DELETE" })
      idsToDelete.add(s.id)
    }

    for (const t of form.startTimes) {
      const slot = existingByTime.get(t)
      if (!slot) continue
      const a = form.assignments[t] ?? { trainerId: "", assistantId: "", classType: "GROUP" as ClassType, publicVisible: true, maxCapacity: 6, repeatWeekly: false }
      const currentTrainer = slot.trainer?.id ?? ""
      const currentAssistant = slot.assistant?.id ?? ""
      const currentType = (slot.classType as ClassType) ?? "GROUP"
      const currentVis = slot.publicVisible ?? true
      const currentCap = slot.maxCapacity ?? 6
      const desiredCap = a.classType === "PRIVATE" ? 1 : a.maxCapacity
      // User unchecked "Repeat weekly" on a slot that's part of a series →
      // tell the server to remove future occurrences from this series.
      const endSeries = !!slot.seriesId && !a.repeatWeekly
      const fieldChanged =
        a.trainerId !== currentTrainer ||
        a.assistantId !== currentAssistant ||
        a.classType !== currentType ||
        a.publicVisible !== currentVis ||
        desiredCap !== currentCap
      if (fieldChanged || endSeries) {
        const tr = a.trainerId ? trainers.find((x) => x.id === a.trainerId) : null
        const as = a.assistantId ? trainers.find((x) => x.id === a.assistantId) : null
        optimisticUpdates.set(slot.id, {
          ...slot,
          classType: a.classType,
          publicVisible: a.publicVisible,
          maxCapacity: desiredCap,
          price: priceForType(a.classType),
          trainer: tr ? { id: tr.id, name: tr.name, color: tr.color } : null,
          assistant: as ? { id: as.id, name: as.name, color: as.color } : null,
          seriesId: endSeries ? null : slot.seriesId,
        })
        payloads.push({
          url: `/api/admin/slots?id=${slot.id}`,
          method: "PATCH",
          body: {
            trainerId: a.trainerId || null,
            assistantId: a.assistantId || null,
            classType: a.classType,
            publicVisible: a.publicVisible,
            maxCapacity: desiredCap,
            price: priceForType(a.classType),
            ...(endSeries ? { endSeries: true } : {}),
          },
        })
      }
    }

    for (const startTime of toCreate) {
      const a = form.assignments[startTime] ?? { trainerId: "", assistantId: "", classType: "GROUP" as ClassType, publicVisible: true, maxCapacity: 6, repeatWeekly: false }
      const isPrivate = a.classType === "PRIVATE"
      const tr = a.trainerId ? trainers.find((x) => x.id === a.trainerId) : null
      const as = a.assistantId ? trainers.find((x) => x.id === a.assistantId) : null
      tempCreates.push({
        id: `tmp-${form.date}-${startTime}-${Math.random().toString(36).slice(2, 8)}`,
        date: form.date,
        startTime,
        endTime: computeEndTime(startTime),
        classType: a.classType,
        publicVisible: a.publicVisible,
        maxCapacity: isPrivate ? 1 : Number(a.maxCapacity),
        price: priceForType(a.classType),
        seriesId: null,  // server will assign one if repeatWeekly is true
        trainer: tr ? { id: tr.id, name: tr.name, color: tr.color } : null,
        assistant: as ? { id: as.id, name: as.name, color: as.color } : null,
        _count: { bookings: a.clients?.length ?? 0 },
      })
      createSpecs.push({
        startTime,
        clients: a.clients ?? [],
        body: {
          date: form.date,
          startTime,
          trainerId: a.trainerId || undefined,
          assistantId: a.assistantId || null,
          classType: a.classType,
          publicVisible: a.publicVisible,
          maxCapacity: isPrivate ? 1 : Number(a.maxCapacity),
          price: priceForType(a.classType),
          repeatWeekly: a.repeatWeekly,
        },
      })
    }

    // Apply optimistic state immediately, then close modal
    if (idsToDelete.size > 0 || optimisticUpdates.size > 0 || tempCreates.length > 0) {
      setSlots((prev) => {
        const remaining = prev.filter((s) => !idsToDelete.has(s.id))
        const updated = remaining.map((s) => optimisticUpdates.get(s.id) ?? s)
        return [...updated, ...tempCreates]
      })
    }
    closeModal()

    if (payloads.length === 0 && createSpecs.length === 0) return

    // Background sync — converge to truth and surface failures unobtrusively.
    // Deletes/updates go in a parallel batch; creates run in their own routine
    // so each created slot's id is known before we book its queued clients.
    const runBatch = Promise.allSettled(
      payloads.map((p) =>
        fetch(p.url, {
          method: p.method,
          ...(p.body !== undefined && {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p.body),
          }),
        }),
      ),
    ).then(async (results) => {
      const failed: string[] = []
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        if (r.status === "rejected") {
          failed.push("Network error — changes not saved")
          continue
        }
        if (!r.value.ok) {
          const txt = await r.value.text().catch(() => "")
          let msg = `Error ${r.value.status}`
          try { msg = JSON.parse(txt).error ?? msg } catch {}
          failed.push(msg)
        }
      }
      return failed
    })

    const runCreates = Promise.all(
      createSpecs.map(async (spec): Promise<string[]> => {
        const errs: string[] = []
        let res: Response
        try {
          res = await fetch("/api/admin/slots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(spec.body),
          })
        } catch {
          return [`create ${spec.startTime}: network`]
        }
        if (!res.ok) {
          const txt = await res.text().catch(() => "")
          let msg = `${res.status}`
          try { msg = JSON.parse(txt).error ?? msg } catch {}
          return [`create ${spec.startTime}: ${msg}`]
        }
        // Slot created — book any queued clients onto its id.
        const created = await res.json().catch(() => null) as { id?: string } | null
        if (created?.id && spec.clients.length) {
          for (const c of spec.clients) {
            try {
              const br = await fetch("/api/admin/bookings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  slotId: created.id,
                  clientName: c.clientName,
                  clientPhone: c.clientPhone,
                  clientEmail: c.clientEmail || undefined,
                  clientTelegram: c.clientTelegram || undefined,
                  partySize: c.partySize || 1,
                }),
              })
              if (!br.ok) {
                const e = await br.json().catch(() => ({}))
                errs.push(`add ${c.clientName}: ${e.error ?? br.status}`)
              }
            } catch {
              errs.push(`add ${c.clientName}: network`)
            }
          }
        }
        return errs
      }),
    ).then((nested) => nested.flat())

    Promise.all([runBatch, runCreates]).then(([batchFailed, createFailed]) => {
      const failed = [...batchFailed, ...createFailed]
      // Always refetch to converge with server truth (correct IDs, etc.)
      fetchSlots()
      if (failed.length > 0) {
        setSyncError(failed.slice(0, 2).join(" · "))
        setTimeout(() => setSyncError(null), 6000)
      }
    })
  }

  // Block/unblock day
  const openBlockModal = (e: React.MouseEvent, date: string) => {
    e.stopPropagation()
    const existing = blockedDays.find((b) => b.date === date)
    setBlockReason(existing?.reason ?? "")
    setBlockModal({ date, existing })
  }

  const handleBlock = () => {
    if (!blockModal) return
    const isUnblock = !!blockModal.existing
    const date = blockModal.date
    const reason = blockReason || null
    // Optimistic — update local state, close modal, fire in background
    setBlockedDays((prev) => {
      if (isUnblock) return prev.filter((b) => b.date !== date)
      return [...prev.filter((b) => b.date !== date), { id: `tmp-${date}`, date, reason }]
    })
    setBlockModal(null)
    const req = isUnblock
      ? fetch(`/api/admin/blocked-days?date=${date}`, { method: "DELETE" })
      : fetch("/api/admin/blocked-days", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, reason }),
        })
    req.then((r) => {
      if (!r.ok) {
        setSyncError(`block: ${r.status}`)
        setTimeout(() => setSyncError(null), 5000)
      }
      fetchBlocked()
    }).catch(() => {
      setSyncError("block: network")
      setTimeout(() => setSyncError(null), 5000)
      fetchBlocked()
    })
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
  const cellPad = view === "week" ? "p-4" : "p-2.5"
  const cellMinH = view === "week" ? "min-h-[160px] lg:min-h-[220px]" : "min-h-[160px]"

  return (
    <div>
      {syncError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] max-w-sm w-[calc(100vw-2rem)] px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs shadow-lg flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2">
            <span className="text-base flex-shrink-0">⚠</span>
            <span className="font-semibold">Save failed — changes reverted</span>
          </div>
          <span className="text-rose-600 break-words leading-relaxed pl-6">{syncError}</span>
        </div>
      )}
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
          </div>
        </div>

        {/* View switcher — full width on mobile */}
        <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5 lg:inline-flex">
          {(["week", "2weeks", "month"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "flex-1 lg:flex-initial px-3 lg:px-4 py-2 rounded-lg text-sm font-medium",
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
            onClick={() => {
              if (view === "week") setAnchor(new Date())
              else if (view === "2weeks") setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))
              else setAnchor(startOfMonth(new Date()))
            }}
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

      {!slotsLoaded && <PetalSpinner className="py-20" />}

      {/* Day headers — only for 2weeks/month, hidden in Week view since
          cells already display weekday + date prominently */}
      {slotsLoaded && view !== "week" && (
        <div className="hidden lg:grid lg:grid-cols-7 gap-2 mb-1.5 px-0.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 uppercase tracking-wide py-1">
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.charAt(0)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Grid — Week view stacks vertically on mobile (today + 6 days),
          2 cols on lg, like the trainer's Week view */}
      <div className={cn(
        "grid gap-2",
        !slotsLoaded && "hidden",
        view === "week"
          ? "grid-cols-1 lg:grid-cols-2"
          : "grid-cols-2 max-lg:landscape:grid-cols-4 lg:grid-cols-7"
      )}>
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd")
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const isOutsideMonth = view === "month" && !isSameMonth(day, anchor)
          const daySlots = slotsForDay(dateStr)
          const blocked = blockedDays.find((b) => b.date === dateStr)

          return (
            <div
              key={dateStr}
              onClick={() => !blocked && openCreate(dateStr)}
              className={cn(
                "rounded-2xl shadow-sm group relative",
                cellPad, cellMinH,
                blocked ? "bg-gray-100 cursor-not-allowed" : "bg-white cursor-pointer",
                !blocked && isSelected ? "ring-2 ring-[#2C6E49]" : !blocked && "hover:ring-1 hover:ring-[#2C6E49]/30",
                isOutsideMonth && "opacity-40",
              )}
            >
              {/* Date + lock */}
              {view === "week" ? (
                <div className="mb-4 flex items-center justify-between gap-2 relative">
                  <div>
                    <div className={cn(
                      "text-lg font-bold leading-tight",
                      isToday && !blocked ? "text-[#2C6E49]" : blocked ? "text-gray-400" : "text-gray-900"
                    )}>
                      {format(day, "EEEE")}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {format(day, "MMMM d")}
                    </div>
                  </div>
                  {isToday && !blocked && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-[#2C6E49] text-white px-2 py-1 rounded-full">Today</span>
                  )}
                </div>
              ) : (
              <div className="text-center relative mb-2.5">
                <div className="lg:hidden text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                  {format(day, "EEE")}
                </div>
                <div className={cn("font-bold mx-auto flex items-center justify-center rounded-full text-lg w-8 h-8 mt-0.5",
                  isToday && !blocked ? "bg-[#2C6E49] text-white" : blocked ? "text-gray-400" : "text-gray-800"
                )}>
                  {format(day, "d")}
                </div>
                {/* Block toggle button */}
                <button
                  onClick={(e) => openBlockModal(e, dateStr)}
                  title={blocked ? `Blocked${blocked.reason ? ": " + blocked.reason : ""}` : "Block day"}
                  className={cn(
                    "absolute top-0 right-0 p-0.5 rounded",
                    blocked ? "opacity-60 text-gray-500 hover:text-red-500" : "opacity-0 group-hover:opacity-60 text-gray-300 hover:text-orange-500"
                  )}
                >
                  {blocked ? <Lock size={10} /> : <Unlock size={10} />}
                </button>
              </div>
              )}

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
                    // Bright = trainer assigned AND at least one client booked.
                    // Pale = trainer assigned but nobody booked yet.
                    const bright = hasTrainer && slot._count.bookings > 0
                    const trainerColor = slot.trainer?.color
                    const typeLabel = slot.classType === "KIDS" ? "Kids" : slot.classType === "PRIVATE" ? "Private" : "Group"
                    const typePill = slot.classType === "KIDS"
                      ? "bg-amber-100 text-amber-900 border-amber-300"
                      : slot.classType === "PRIVATE"
                        ? "bg-purple-100 text-purple-900 border-purple-300"
                        : bright
                          // Sits on a white pill over the vivid trainer colour,
                          // so the text must stay dark in BOTH themes — use an
                          // explicit hex so the dark-mode remap can't lighten it.
                          ? "bg-white/90 text-[#1f2937] border-white/60"
                          : "bg-gray-100 text-gray-700 border-gray-200"

                    const isHidden = !slot.publicVisible
                    return (
                      <div
                        key={slot.id}
                        onClick={(e) => { e.stopPropagation(); openCreate(slot.date) }}
                        style={cardStyle}
                        className={cn(
                          "rounded-lg p-1.5 relative group/slot cursor-pointer transition-all border",
                          !hasTrainer && "bg-gray-50 border-gray-200 hover:bg-gray-100",
                          isHidden && "opacity-60 border-dashed"
                        )}
                        title={isHidden ? "Hidden from clients" : undefined}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div
                            className={cn(
                              "text-xs font-semibold leading-tight",
                              // Unassigned (no trainer colour): use a theme-aware
                              // utility so the dark-mode remap keeps it readable.
                              // An empty inline style would inherit the dark
                              // default → black-on-black on the dark card.
                              !bright && !trainerColor && "text-gray-800",
                            )}
                            style={bright ? { color: "white" } : trainerColor ? { color: trainerColor } : undefined}
                          >
                            {formatTime(slot.startTime)}
                            <span className="block font-normal text-[10px] opacity-70">{formatTime(slot.endTime)}</span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 group-hover/slot:opacity-0 transition-opacity">
                            <span
                              className={cn(
                                "px-1.5 py-[1px] rounded text-[9px] font-bold uppercase tracking-wide leading-none border whitespace-nowrap",
                                typePill,
                              )}
                            >
                              {typeLabel}
                            </span>
                            {isHidden && (
                              <span
                                title="Hidden from clients"
                                className="inline-flex items-center justify-center w-4 h-4 rounded bg-white/95 border border-gray-300 text-[#6b7280]"
                              >
                                <EyeOff size={10} strokeWidth={2.25} />
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={cn("mt-0.5 truncate text-[10px]", !bright && !trainerColor && "text-gray-500")}
                          style={bright ? { color: "rgba(255,255,255,0.75)" } : trainerColor ? { color: hexToRgba(trainerColor, 0.9) } : undefined}
                        >
                          {slot.trainer?.name ?? "—"}
                          {slot.assistant && (
                            <span className="opacity-75"> + {slot.assistant.name}</span>
                          )}
                        </div>
                        <div
                          className={cn("text-[10px]", !bright && !trainerColor && "text-gray-400")}
                          style={bright ? { color: "rgba(255,255,255,0.6)" } : trainerColor ? { color: hexToRgba(trainerColor, 0.7) } : undefined}
                        >
                          {slot._count.bookings}/{slot.maxCapacity}
                        </div>
                      </div>
                    )
                  })}
                  {daySlots.length < 7 && (
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 touch-none" onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault() }}>
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
                className={cn("flex-1 py-2.5 rounded-xl text-sm font-medium text-white",
                  blockModal.existing ? "bg-green-600 hover:bg-green-700" : "bg-orange-500 hover:bg-orange-600"
                )}
              >
                {blockModal.existing ? "Unblock" : "Block Day"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 touch-none" onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault() }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-shrink-0 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{slots.some((s) => s.date === form.date) ? "Manage day's sessions" : "Add Session"}</h2>
                <p className="text-sm text-gray-400 mt-0.5">{format(new Date(form.date + "T00:00:00"), "EEEE, MMMM d")}</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>

            <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden min-w-0">
              <div className="px-6 py-4 space-y-4 overflow-y-auto overflow-x-hidden flex-1 overscroll-contain">
                {formError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2.5 rounded-xl flex items-start gap-2">
                    <span className="text-base leading-none">⚠</span>
                    <span className="flex-1">{formError}</span>
                    <button type="button" onClick={() => setFormError("")} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session times</label>
                  <p className="text-xs text-gray-400 mb-2">Pick one or more — each creates a separate session (+120 min). Times within 2h of an existing one are locked.</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {TIME_PRESETS.map((t) => {
                      const selected = form.startTimes.includes(t)
                      const conflictWith = !selected ? overlapsAny(t, form.startTimes) : null
                      const disabled = !!conflictWith
                      return (
                        <button key={t} type="button"
                          disabled={disabled}
                          title={disabled && conflictWith ? `Conflicts with ${formatTime(conflictWith)}` : undefined}
                          onClick={() => {
                            if (selected) {
                              const newA = { ...form.assignments }
                              delete newA[t]
                              setForm({ ...form, startTimes: form.startTimes.filter((x) => x !== t), assignments: newA })
                              setFormError("")
                            } else {
                              const newTimes = sortTimes([...form.startTimes, t])
                              const newA = { ...form.assignments }
                              if (!newA[t]) newA[t] = { trainerId: "", assistantId: "", classType: "GROUP", publicVisible: true, maxCapacity: 6, repeatWeekly: false }
                              setForm({ ...form, startTimes: newTimes, assignments: newA })
                              setFormError("")
                            }
                          }}
                          className={cn("px-2.5 py-1 text-xs rounded-lg border font-medium",
                            selected
                              ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                              : disabled
                                ? "bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed line-through"
                                : "bg-white text-gray-600 border-gray-200 hover:border-[#2C6E49]/40"
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
                        if (form.startTimes.includes(form.customTime)) {
                          setFormError(`${formatTime(form.customTime)} is already in the list`)
                          return
                        }
                        const conflict = overlapsAny(form.customTime, form.startTimes)
                        if (conflict) {
                          setFormError(`${formatTime(form.customTime)} overlaps with ${formatTime(conflict)}–${formatTime(computeEndTime(conflict))} (classes are 2h long)`)
                          return
                        }
                        const newA = { ...form.assignments }
                        if (!newA[form.customTime]) newA[form.customTime] = { trainerId: "", assistantId: "", classType: "GROUP", publicVisible: true, maxCapacity: 6, repeatWeekly: false }
                        setForm({ ...form, startTimes: sortTimes([...form.startTimes, form.customTime]), assignments: newA })
                        setFormError("")
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
                                const assignment = form.assignments[t] ?? { trainerId: "", assistantId: "", classType: "GROUP" as ClassType, publicVisible: true, maxCapacity: 6, repeatWeekly: false }
                                const updateAssignment = (patch: Partial<SlotAssignment>) => {
                                  setForm((prev) => ({
                                    ...prev,
                                    assignments: { ...prev.assignments, [t]: { ...assignment, ...patch } },
                                  }))
                                }
                                const isPrivate = assignment.classType === "PRIVATE"
                                const existingSlot = isExisting ? slots.find((s) => s.date === form.date && s.startTime === t) : null
                                const bookingCount = existingSlot?._count.bookings ?? 0
                                const hasBookings = bookingCount > 0
                                // Queued (not-yet-saved) clients for a new session.
                                const queuedCount = assignment.clients?.length ?? 0
                                // A trainer must be assigned before clients can be added; and once
                                // clients exist, the trainer can only be SWITCHED, never removed.
                                const trainerSelected = !!assignment.trainerId
                                const hasClients = isExisting ? hasBookings : queuedCount > 0
                                return (
                                  <div key={t} className={cn(
                                    "rounded-lg text-xs border px-3 py-2.5 space-y-2",
                                    isExisting ? "bg-gray-50 border-gray-200" : "bg-[#2C6E49]/5 border-[#2C6E49]/15"
                                  )}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={cn(
                                        "font-medium whitespace-nowrap",
                                        isExisting ? "text-gray-700" : "text-[#2C6E49]"
                                      )}>
                                        {formatTime(t)} – {formatTime(computeEndTime(t))}
                                      </span>
                                      <div className="ml-auto flex gap-1">
                                        {CLASS_TYPES.map((c) => (
                                          <button key={c.value} type="button"
                                            onClick={() => {
                                              if (c.value === "PRIVATE") {
                                                if (bookingCount >= 2) {
                                                  const ok = confirm(`This session has ${bookingCount} bookings. Private allows only 1 person — extra clients will be over capacity. Continue?`)
                                                  if (!ok) return
                                                }
                                                // Private defaults to hidden from the public schedule.
                                                updateAssignment({ classType: c.value, maxCapacity: 1, publicVisible: false })
                                              } else if (c.value === "GROUP") {
                                                updateAssignment({
                                                  classType: c.value,
                                                  publicVisible: true,
                                                  maxCapacity: isPrivate ? 6 : assignment.maxCapacity,
                                                })
                                              } else {
                                                // Kids defaults to visible in the public schedule.
                                                updateAssignment({
                                                  classType: c.value,
                                                  publicVisible: true,
                                                  maxCapacity: isPrivate ? 6 : assignment.maxCapacity,
                                                })
                                              }
                                            }}
                                            title={c.label}
                                            className={cn(
                                              "w-7 h-7 rounded text-[11px] font-bold leading-none flex items-center justify-center border touch-manipulation",
                                              assignment.classType === c.value
                                                ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                                                : "bg-white text-gray-500 border-gray-200"
                                            )}>
                                            {c.value[0]}
                                          </button>
                                        ))}
                                      </div>
                                      {(assignment.classType === "KIDS" || assignment.classType === "PRIVATE") && (
                                        <>
                                          <span className="w-px h-5 bg-gray-300/60 flex-shrink-0" aria-hidden />
                                          <button type="button"
                                            onClick={() => updateAssignment({ publicVisible: !assignment.publicVisible })}
                                            title={assignment.publicVisible ? "Visible to clients — tap to hide" : "Hidden from clients — tap to show"}
                                            className={cn(
                                              "w-7 h-7 rounded flex items-center justify-center border touch-manipulation",
                                              assignment.publicVisible
                                                ? "bg-white text-[#2C6E49] border-[#2C6E49]/40"
                                                : "bg-gray-50 text-gray-400 border-gray-200"
                                            )}>
                                            {assignment.publicVisible
                                              ? <Eye size={14} strokeWidth={2.25} />
                                              : <EyeOff size={14} strokeWidth={2.25} />}
                                          </button>
                                        </>
                                      )}
                                      {/* Remove session — inline at the end of the time row so it
                                          doesn't reserve a wasted vertical strip down the card. */}
                                      <button type="button"
                                        disabled={hasBookings}
                                        onClick={() => {
                                          const newAssignments = { ...form.assignments }
                                          delete newAssignments[t]
                                          setForm({ ...form, startTimes: form.startTimes.filter((x) => x !== t), assignments: newAssignments })
                                        }}
                                        title={hasBookings
                                          ? `Has ${bookingCount} booking${bookingCount === 1 ? "" : "s"} — cancel them first or hide the session instead`
                                          : isExisting ? "Remove this session" : "Discard this new session"}
                                        aria-label="Remove session"
                                        className={cn(
                                          "w-6 h-6 rounded-md flex items-center justify-center text-lg leading-none touch-manipulation flex-shrink-0",
                                          hasBookings ? "text-gray-300 cursor-not-allowed" :
                                            isExisting ? "text-gray-400 hover:text-rose-600 hover:bg-rose-50" : "text-[#2C6E49]/60 hover:text-rose-600 hover:bg-rose-50"
                                        )}>×</button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <select
                                        value={assignment.trainerId}
                                        onChange={(e) => {
                                          const next = e.target.value
                                          // Once clients are on the class the trainer can only be
                                          // SWITCHED to another trainer, never cleared.
                                          if (!next && hasClients) return
                                          updateAssignment({ trainerId: next, assistantId: next ? assignment.assistantId : "" })
                                        }}
                                        title={hasClients ? "A trainer is required while clients are booked — you can switch trainers but not remove" : "Trainer"}
                                        className="flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#2C6E49]/30"
                                      >
                                        {!hasClients && <option value="">Unassigned</option>}
                                        {trainers.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                                      </select>
                                      {assignment.trainerId && (
                                        <select
                                          value={assignment.assistantId}
                                          onChange={(e) => updateAssignment({ assistantId: e.target.value })}
                                          className="flex-1 min-w-0 text-xs border border-dashed border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#2C6E49]/30 text-gray-500"
                                          title="Assistant"
                                        >
                                          <option value="">+ Asst</option>
                                          {trainers.filter((tr) => tr.id !== assignment.trainerId).map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                                        </select>
                                      )}
                                      <span className="w-px h-5 bg-gray-300/60 flex-shrink-0" aria-hidden />
                                      <select
                                        value={isPrivate ? 1 : assignment.maxCapacity}
                                        disabled={isPrivate}
                                        onChange={(e) => updateAssignment({ maxCapacity: Number(e.target.value) })}
                                        title={isPrivate ? "Private session is always 1 person" : "Capacity"}
                                        className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#2C6E49]/30 disabled:opacity-60 disabled:bg-gray-50 flex-shrink-0"
                                      >
                                        {[1, 2, 3, 4, 5, 6].map((n) => (
                                          <option key={n} value={n}>👤 {n}</option>
                                        ))}
                                      </select>
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
                                      const weekday = format(new Date(form.date + "T00:00:00"), "EEEE")
                                      const isPartOfSeries = isExisting && !!(existingSlot?.seriesId)
                                      const showSeriesWarning = isPartOfSeries && !assignment.repeatWeekly
                                      return (
                                        <label className={cn(
                                          "flex items-start gap-2 cursor-pointer select-none rounded-md px-2 py-1.5 transition-colors",
                                          assignment.repeatWeekly
                                            ? "bg-[#2C6E49]/5 hover:bg-[#2C6E49]/10"
                                            : "bg-gray-50 hover:bg-gray-100"
                                        )}>
                                          <input type="checkbox"
                                            checked={assignment.repeatWeekly}
                                            onChange={(e) => updateAssignment({ repeatWeekly: e.target.checked })}
                                            className="w-4 h-4 mt-0.5 accent-[#2C6E49] flex-shrink-0"
                                          />
                                          <div className="min-w-0 flex-1 leading-tight">
                                            <div className={cn(
                                              "text-[11px] font-medium",
                                              assignment.repeatWeekly ? "text-[#2C6E49]" : "text-gray-600"
                                            )}>
                                              Repeat every {weekday}
                                            </div>
                                            <div className="text-[10px] text-gray-500 mt-0.5">
                                              {showSeriesWarning
                                                ? "Unchecking stops the series — future occurrences will be removed"
                                                : isPartOfSeries
                                                  ? "Part of a weekly series"
                                                  : isExisting
                                                    ? "Currently one-off (turning on won't backfill past weeks)"
                                                    : `Also schedule the next ${12} ${weekday}s`}
                                            </div>
                                          </div>
                                        </label>
                                      )
                                    })()}
                                    {isExisting && existingSlot && (
                                      <SlotClientList slot={existingSlot} allSlots={slots} onChanged={fetchSlots} canAdd={trainerSelected} />
                                    )}
                                    {!isExisting && (
                                      <QueuedClients
                                        clients={assignment.clients ?? []}
                                        capacity={isPrivate ? 1 : Number(assignment.maxCapacity)}
                                        onChange={(c) => updateAssignment({ clients: c })}
                                        canAdd={trainerSelected}
                                      />
                                    )}
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

              </div>

              <div className="px-6 py-4 flex gap-3 flex-shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-[#2C6E49] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#1E4D34]">
                  {(() => {
                    const existing = slots.filter((s) => s.date === form.date)
                    const existingByTime = new Map(existing.map((s) => [s.startTime, s] as const))
                    const desired = new Set(form.startTimes)
                    const toCreate = form.startTimes.filter((t) => !existingByTime.has(t)).length
                    const toDelete = existing.filter((s) => !desired.has(s.startTime)).length
                    let toUpdate = 0
                    for (const t of form.startTimes) {
                      const slot = existingByTime.get(t)
                      if (!slot) continue
                      const a = form.assignments[t] ?? { trainerId: "", assistantId: "", classType: "GROUP" as ClassType, publicVisible: true, maxCapacity: 6, repeatWeekly: false }
                      const desiredCap = a.classType === "PRIVATE" ? 1 : a.maxCapacity
                      if (
                        a.trainerId !== (slot.trainer?.id ?? "") ||
                        a.assistantId !== (slot.assistant?.id ?? "") ||
                        a.classType !== ((slot.classType as ClassType) ?? "GROUP") ||
                        a.publicVisible !== (slot.publicVisible ?? true) ||
                        desiredCap !== (slot.maxCapacity ?? 6)
                      ) toUpdate++
                    }
                    if (toCreate === 0 && toDelete === 0 && toUpdate === 0) return "Save"
                    const parts: string[] = []
                    if (toCreate > 0) parts.push(`+${toCreate}`)
                    if (toDelete > 0) parts.push(`−${toDelete}`)
                    if (toUpdate > 0) parts.push(`~${toUpdate}`)
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
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 touch-none" onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault() }}>
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
