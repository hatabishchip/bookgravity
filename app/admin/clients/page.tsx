"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { Search, CalendarPlus, X, Loader2, Check, AlertCircle, Phone, Mail, Ticket, BadgeCheck, Clock, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { SellMembershipModal } from "@/app/_components/SellMembershipButton"
import PhoneInput from "@/app/_components/PhoneInput"
import { formatPhoneInput, validatePhone } from "@/lib/phone"

type Client = {
  name: string
  phone: string
  email: string | null
  confirmedCount: number
  cancelledCount: number
  lastClassDate: string | null
  lastBookedAt: string
}

type Slot = {
  id: string
  date: string
  startTime: string
  endTime: string
  classType: string
  maxCapacity: number
  trainer: { id: string; name: string } | null
  _count: { bookings: number }
}

type HistoryBooking = {
  id: string
  date: string
  startTime: string
  endTime: string
  classType: string
  trainerName: string | null
  status: string
  paymentType: string
  paymentStatus: string
  checkedIn: boolean
  ticketCode: string
  bookedAt: string
  cancelledAt: string | null
  services: string[]
  viaMembership: boolean
}

type HistoryMembership = {
  id: string
  totalClasses: number
  remainingClasses: number
  paymentType: string
  soldByName: string | null
  note: string | null
  soldAt: string
}

const formatTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function plusDaysStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// History modal: the client's full dossier — every booking ever (incl.
// cancelled, with when it was cancelled), how each class was paid, and all
// membership batches with remaining balances.
// ---------------------------------------------------------------------------
const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  EDC: "Card (EDC)",
  QR: "QR",
  TRANSFER: "Transfer",
  MEMBERSHIP: "Membership",
  PENDING: "Pending",
}

function HistoryModal({ client, onClose, onBook }: {
  client: Client
  onClose: () => void
  onBook: () => void
}) {
  const [data, setData] = useState<{ bookings: HistoryBooking[]; memberships: HistoryMembership[] } | null>(null)
  // Sell a Member card straight from the client card, pre-filled.
  const [selling, setSelling] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/clients/history?phone=${encodeURIComponent(client.phone)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { bookings: [], memberships: [] }))
      .then(setData)
      .catch(() => setData({ bookings: [], memberships: [] }))
  }, [client.phone])

  const membershipBalance = (data?.memberships ?? []).reduce((sum, m) => sum + m.remainingClasses, 0)

  return (
    <div className="fixed inset-0 z-50 bg-white sm:bg-black/40 sm:flex sm:items-center sm:justify-center overflow-y-auto">
      <div className="sm:bg-white sm:rounded-2xl sm:shadow-xl sm:max-w-lg sm:w-full sm:max-h-[85vh] sm:overflow-y-auto bg-white min-h-full sm:min-h-0">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{client.name || "—"}</h2>
            <div className="mt-0.5 flex items-center gap-3 flex-wrap text-xs text-gray-500">
              <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-brand">
                <Phone size={12} /> {client.phone}
              </a>
              {client.email && (
                <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1 hover:text-brand truncate max-w-[200px]">
                  <Mail size={12} /> {client.email}
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setSelling(true)}
              className="inline-flex items-center gap-1.5 bg-white border border-brand/30 text-brand hover:bg-brand/5 text-xs font-semibold px-3 py-2 rounded-xl touch-manipulation"
            >
              🎟️ Member card
            </button>
            <button
              onClick={() => { onClose(); onBook() }}
              className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-dark text-white text-xs font-semibold px-3 py-2 rounded-xl touch-manipulation"
            >
              <CalendarPlus size={13} /> Book
            </button>
            <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {data === null ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading history…
            </div>
          ) : (
            <>
              {/* Memberships */}
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Member cards</h3>
                  {membershipBalance > 0 && (
                    <span className="text-xs font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                      {membershipBalance} class{membershipBalance === 1 ? "" : "es"} left
                    </span>
                  )}
                </div>
                {data.memberships.length === 0 ? (
                  <div className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl px-3 py-3 text-center">
                    No memberships bought.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {data.memberships.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5">
                        <Ticket size={16} className={m.remainingClasses > 0 ? "text-brand" : "text-gray-300"} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900">
                            {m.remainingClasses}/{m.totalClasses} classes left
                          </div>
                          <div className="text-[11px] text-gray-400">
                            Bought {format(parseISO(m.soldAt), "MMM d, yyyy")}
                            {" · "}{PAYMENT_LABELS[m.paymentType] ?? m.paymentType}
                            {m.soldByName && ` · sold by ${m.soldByName}`}
                            {m.note && ` · ${m.note}`}
                          </div>
                        </div>
                        {m.remainingClasses === 0 && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">used up</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Booking history */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  History ({data.bookings.length})
                </h3>
                {data.bookings.length === 0 ? (
                  <div className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl px-3 py-3 text-center">
                    No bookings yet.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {data.bookings.map((b) => {
                      const cancelled = b.status === "CANCELLED"
                      return (
                        <li
                          key={b.id}
                          className={cn(
                            "rounded-xl border px-3 py-2.5",
                            cancelled ? "border-gray-100 bg-gray-50" : "border-gray-200",
                          )}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-sm font-semibold", cancelled ? "text-gray-400 line-through" : "text-gray-900")}>
                              {format(parseISO(b.date + "T00:00:00"), "MMM d, yyyy")} · {formatTime(b.startTime)}
                            </span>
                            {cancelled ? (
                              <span className="text-[10px] uppercase tracking-wider font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                                cancelled
                              </span>
                            ) : b.checkedIn ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded">
                                <BadgeCheck size={11} /> visited
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-[11px] text-gray-400">
                            {b.classType === "GROUP" ? "Group" : b.classType === "KIDS" ? "Kids" : "Private"}
                            {b.trainerName && ` · ${b.trainerName}`}
                            {" · ticket "}{b.ticketCode}
                            {b.services.length > 0 && ` · ${b.services.join(", ")}`}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[11px]">
                            {/* Payment line: how (or whether) this class was paid. */}
                            {cancelled ? (
                              b.cancelledAt && (
                                <span className="inline-flex items-center gap-1 text-gray-400">
                                  <Clock size={11} /> cancelled {format(parseISO(b.cancelledAt), "MMM d, HH:mm")}
                                </span>
                              )
                            ) : b.viaMembership || b.paymentType === "MEMBERSHIP" ? (
                              <span className="font-semibold text-brand">Paid · membership</span>
                            ) : b.paymentStatus === "PAID" ? (
                              <span className="font-semibold text-brand">
                                Paid · {PAYMENT_LABELS[b.paymentType] ?? b.paymentType}
                              </span>
                            ) : (
                              <span className="font-semibold text-amber-600">Not paid</span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      {selling && (
        <SellMembershipModal
          initialPhone={client.phone}
          initialName={client.name ?? ""}
          onClose={() => setSelling(false)}
        />
      )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Booking modal: pick one or MANY upcoming classes for this client at once.
// Each selected class becomes its own booking (same flow as the schedule's
// manual add — confirmations/notifications included via the existing API).
// ---------------------------------------------------------------------------
function BookModal({ client, onClose, onBooked }: {
  client: Client
  onClose: () => void
  onBooked: () => void
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  // Per-slot outcome after "Book": ok / error message.
  const [results, setResults] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    fetch(`/api/admin/slots?from=${todayStr()}&to=${plusDaysStr(30)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Slot[]) => {
        const now = new Date()
        const nowDate = todayStr()
        const nowMin = now.getHours() * 60 + now.getMinutes()
        setSlots(
          // Keep trainer-less classes IN the list (rendered disabled with an
          // explanation) - silently hiding them made a class visible on the
          // Schedule "just disappear" here, which read as a bug.
          list.filter((s) => {
            if (s.date < nowDate) return false
            if (s.date === nowDate) {
              const [h, m] = s.startTime.split(":").map(Number)
              if (h * 60 + m <= nowMin) return false
            }
            return true
          }),
        )
      })
      .catch(() => setSlots([]))
  }, [])

  const byDate = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of slots ?? []) {
      const list = map.get(s.date) ?? []
      list.push(s)
      map.set(s.date, list)
    }
    return map
  }, [slots])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const book = async () => {
    if (!selected.size || busy) return
    setBusy(true)
    const outcomes = new Map<string, string>()
    // Sequential on purpose: each POST re-checks capacity transactionally and
    // sends its own notifications; parallel posts would just race the seats.
    for (const slotId of selected) {
      try {
        const res = await fetch("/api/admin/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotId,
            clientName: client.name,
            clientPhone: client.phone,
            clientEmail: client.email ?? "",
            partySize: 1,
          }),
        })
        if (res.ok) outcomes.set(slotId, "ok")
        else {
          const data = await res.json().catch(() => null)
          outcomes.set(slotId, data?.error || `Error ${res.status}`)
        }
      } catch {
        outcomes.set(slotId, "Network error")
      }
      setResults(new Map(outcomes))
    }
    setBusy(false)
    if ([...outcomes.values()].every((v) => v === "ok")) {
      onBooked()
      onClose()
    } else {
      // Leave the modal open so failures stay visible; clear the successful
      // picks so a retry only re-sends the failed ones.
      setSelected(new Set([...outcomes.entries()].filter(([, v]) => v !== "ok").map(([k]) => k)))
      onBooked()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white sm:bg-black/40 sm:flex sm:items-center sm:justify-center overflow-y-auto">
      <div className="sm:bg-white sm:rounded-2xl sm:shadow-xl sm:max-w-lg sm:w-full sm:max-h-[85vh] sm:overflow-y-auto bg-white min-h-full sm:min-h-0">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">Book {client.name}</h2>
            <p className="text-xs text-gray-400">{client.phone} · pick one or several classes</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 pb-28 sm:pb-4">
          {slots === null ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading classes…
            </div>
          ) : byDate.size === 0 ? (
            <div className="text-sm text-gray-400 text-center py-8">No upcoming classes in the next 30 days.</div>
          ) : (
            [...byDate.entries()].map(([date, list]) => (
              <div key={date}>
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  {format(parseISO(date + "T00:00:00"), "EEEE, MMM d")}
                </div>
                <div className="space-y-1.5">
                  {list.map((s) => {
                    const seatsLeft = s.maxCapacity - s._count.bookings
                    const full = seatsLeft <= 0
                    const noTrainer = !s.trainer
                    const isSel = selected.has(s.id)
                    const result = results.get(s.id)
                    return (
                      <button
                        key={s.id}
                        disabled={full || noTrainer || busy}
                        onClick={() => toggle(s.id)}
                        title={noTrainer ? "Assign a trainer to this class first (Schedule)" : undefined}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors touch-manipulation",
                          full || noTrainer
                            ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                            : isSel
                              ? "border-brand bg-brand/10"
                              : "border-gray-200 hover:border-brand/50",
                        )}
                      >
                        <span
                          className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center shrink-0",
                            isSel ? "bg-brand border-brand text-white" : "border-gray-300",
                          )}
                        >
                          {isSel && <Check size={13} strokeWidth={3} />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-gray-900">
                            {formatTime(s.startTime)} · {s.classType === "GROUP" ? "Group" : s.classType === "KIDS" ? "Kids" : "Private"}
                          </span>
                          <span className="block text-xs text-gray-400 truncate">
                            {noTrainer
                              ? "No trainer assigned - assign one in Schedule first"
                              : `${s.trainer?.name} · ${full ? "Full" : `${seatsLeft} spot${seatsLeft === 1 ? "" : "s"} left`}`}
                          </span>
                        </span>
                        {result === "ok" ? (
                          <span className="text-brand"><Check size={16} /></span>
                        ) : result ? (
                          <span className="flex items-center gap-1 text-xs text-red-500 max-w-[40%] truncate" title={result}>
                            <AlertCircle size={13} className="shrink-0" /> {result}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="fixed sm:sticky bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center gap-3">
          <div className="text-xs text-gray-400 flex-1">
            {selected.size ? `${selected.size} class${selected.size === 1 ? "" : "es"} selected` : "Nothing selected"}
          </div>
          <button
            onClick={book}
            disabled={!selected.size || busy}
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl touch-manipulation"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {busy ? "Booking…" : `Book${selected.size > 1 ? ` ${selected.size}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// Correct a client's saved contact details. Rare, admin-only. Re-keys the phone
// across bookings/chat/passes server-side (see PATCH /api/admin/clients).
function EditClientModal({ client, onClose, onSaved }: {
  client: Client
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(client.name || "")
  const [phone, setPhone] = useState(() => formatPhoneInput("+" + client.phone.replace(/\D/g, "")))
  const [email, setEmail] = useState(client.email || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const newDigits = phone.replace(/\D/g, "")
  const currDigits = client.phone.replace(/\D/g, "")
  // Same country-length validation as the booking widget: a truncated number
  // (one digit short for its country) is caught right here, not by the client.
  const phoneOk = validatePhone(phone).kind === "ok"
  const phoneChanged = newDigits !== currDigits
  const nameChanged = name.trim() !== (client.name || "").trim()
  const emailChanged = email.trim() !== (client.email || "").trim()
  const changed = phoneChanged || nameChanged || emailChanged

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      // Only the fields that actually changed: an untouched email must not be
      // stamped over every booking's (possibly different) historical email.
      const res = await fetch("/api/admin/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPhone: client.phone,
          ...(phoneChanged ? { newPhone: newDigits } : {}),
          ...(nameChanged ? { newName: name.trim() } : {}),
          ...(emailChanged ? { newEmail: email.trim() } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Could not save")
        setSaving(false)
        return
      }
      onSaved()
      onClose()
    } catch {
      setError("Network error")
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Edit client</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-gray-400 -mt-2">
          Corrects the saved contact everywhere - bookings, WhatsApp chat and passes all move to the new number.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </label>
        <PhoneInput
          label="Phone (with country code)"
          value={phone}
          onChange={setPhone}
          compact
          placeholder="+49 176 21184627"
        />
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
          {emailChanged && email.trim() === "" && (
            <span className="text-[11px] text-amber-600 mt-0.5 block">
              Empty - saving will remove the email from this client&apos;s bookings.
            </span>
          )}
        </label>
        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle size={13} /> {error}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!changed || !phoneOk || saving}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-brand hover:bg-brand-dark disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null)
  const [query, setQuery] = useState("")
  const [bookFor, setBookFor] = useState<Client | null>(null)
  const [historyFor, setHistoryFor] = useState<Client | null>(null)
  const [editFor, setEditFor] = useState<Client | null>(null)

  const load = useCallback(() => {
    fetch("/api/admin/clients", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setClients)
      .catch(() => setClients([]))
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!clients) return null
    const q = query.trim().toLowerCase()
    if (!q) return clients
    const qDigits = q.replace(/\D/g, "")
    return clients.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (qDigits && c.phone.replace(/\D/g, "").includes(qDigits)) ||
      (c.email ?? "").toLowerCase().includes(q),
    )
  }, [clients, query])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Everyone who ever booked — including cancelled bookings, so no one&apos;s contact details get lost.
          </p>
        </div>
        {clients && (
          <div className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            {clients.length} total
          </div>
        )}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone or email…"
          className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        />
      </div>

      {filtered === null ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading clients…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          {query ? "No clients match the search." : "No clients yet — they appear after the first booking."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div
              key={c.phone + c.name}
              role="button"
              tabIndex={0}
              onClick={() => setHistoryFor(c)}
              onKeyDown={(e) => { if (e.key === "Enter") setHistoryFor(c) }}
              className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap sm:flex-nowrap cursor-pointer hover:shadow transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{c.name || "—"}</span>
                  {c.confirmedCount === 0 && c.cancelledCount > 0 && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                      cancelled only
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-3 flex-wrap text-xs text-gray-500">
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-brand">
                    <Phone size={12} /> {c.phone}
                  </a>
                  {c.email && (
                    <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-brand truncate max-w-[220px]">
                      <Mail size={12} /> {c.email}
                    </a>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-gray-400">
                  {c.confirmedCount} booking{c.confirmedCount === 1 ? "" : "s"}
                  {c.cancelledCount > 0 && ` · ${c.cancelledCount} cancelled`}
                  {c.lastClassDate && ` · last class ${format(parseISO(c.lastClassDate + "T00:00:00"), "MMM d")}`}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setEditFor(c) }}
                aria-label="Edit client"
                className="p-2.5 rounded-xl text-gray-400 hover:text-brand hover:bg-gray-50 shrink-0"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setBookFor(c) }}
                className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-dark text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl touch-manipulation shrink-0"
              >
                <CalendarPlus size={14} /> Book
              </button>
            </div>
          ))}
        </div>
      )}

      {historyFor && (
        <HistoryModal
          client={historyFor}
          onClose={() => setHistoryFor(null)}
          onBook={() => setBookFor(historyFor)}
        />
      )}
      {bookFor && <BookModal client={bookFor} onClose={() => setBookFor(null)} onBooked={load} />}
      {editFor && <EditClientModal client={editFor} onClose={() => setEditFor(null)} onSaved={load} />}
    </div>
  )
}
