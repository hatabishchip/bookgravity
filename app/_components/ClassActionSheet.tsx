"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime12 } from "@/lib/format"

// "Can't run this class" sheet — cancel or move a WHOLE class in two taps.
// Shared by the trainer cabinet and the admin schedule (the API base differs).
// Built after the 04.07 incident: a sick trainer had no tool to cancel a class
// and warn everyone, so a client was cancelled with a dry robo-message and
// still came to the studio. Every action here notifies every booked client
// through an approved WhatsApp template and returns pass classes automatically.

type SheetSlot = {
  id: string
  date: string
  startTime: string
  endTime: string
  /** CONFIRMED bookings on the class right now. */
  bookedCount: number
}

type MoveOption = {
  id: string
  date: string
  startTime: string
  endTime: string
  classType: string
  trainerName: string | null
  mine?: boolean
  spotsLeft: number
}

type Reason = "sick" | "emergency" | "other"

const REASONS: { value: Reason; label: string }[] = [
  { value: "sick", label: "Feeling unwell" },
  { value: "emergency", label: "Emergency" },
  { value: "other", label: "Other" },
]

export function ClassActionSheet({
  slot,
  role,
  trainers,
  onClose,
  onDone,
}: {
  slot: SheetSlot
  role: "trainer" | "admin"
  /** Admin only: studio trainers, lets the admin hand the moved class to a cover. */
  trainers?: { id: string; name: string }[]
  onClose: () => void
  /** Called after a successful cancel/move so the parent can refetch. */
  onDone: () => void
}) {
  const apiBase = role === "trainer" ? "/api/trainer/slots" : "/api/admin/slots"

  const [mode, setMode] = useState<"cancel" | "move" | null>(null)
  const [reason, setReason] = useState<Reason>("sick")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  // Move — destination.
  const [moveTab, setMoveTab] = useState<"existing" | "new">("existing")
  const [options, setOptions] = useState<MoveOption[] | null>(null)
  const [picked, setPicked] = useState<MoveOption | null>(null)
  const [newDate, setNewDate] = useState("")
  const [newStart, setNewStart] = useState(slot.startTime)
  const [newEnd, setNewEnd] = useState(slot.endTime)
  const [coverTrainerId, setCoverTrainerId] = useState("")

  // Load move destinations once the move mode opens.
  useEffect(() => {
    if (mode !== "move" || options !== null) return
    let alive = true
    ;(async () => {
      try {
        if (role === "trainer") {
          const res = await fetch("/api/trainer/reschedule-options")
          const all: MoveOption[] = await res.json()
          if (alive) setOptions(all.filter((o) => o.id !== slot.id && o.spotsLeft >= slot.bookedCount))
        } else {
          const today = new Date().toISOString().slice(0, 10)
          const horizon = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10)
          const res = await fetch(`/api/admin/slots?from=${today}&to=${horizon}`)
          const all: {
            id: string
            date: string
            startTime: string
            endTime: string
            classType: string
            maxCapacity: number
            trainerId: string | null
            trainer: { name: string } | null
            _count: { bookings: number }
          }[] = await res.json()
          if (alive)
            setOptions(
              all
                .filter((s) => s.id !== slot.id && s.trainerId)
                .map((s) => ({
                  id: s.id,
                  date: s.date,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  classType: s.classType,
                  trainerName: s.trainer?.name ?? null,
                  spotsLeft: s.maxCapacity - s._count.bookings,
                }))
                .filter((o) => o.spotsLeft >= slot.bookedCount),
            )
        }
      } catch {
        if (alive) setOptions([])
      }
    })()
    return () => {
      alive = false
    }
  }, [mode, options, role, slot.id, slot.bookedCount])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      if (mode === "cancel") {
        const res = await fetch(`${apiBase}/${slot.id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Couldn't cancel the class")
        setDoneMsg(
          slot.bookedCount > 0
            ? `Class cancelled. ${data.notifiedClients ?? slot.bookedCount} client(s) got a WhatsApp message, pass classes are back on their passes.`
            : "Class cancelled.",
        )
      } else if (mode === "move") {
        const target =
          moveTab === "existing"
            ? picked && { kind: "existing" as const, slotId: picked.id }
            : newDate && newStart && newEnd && {
                kind: "new" as const,
                date: newDate,
                startTime: newStart,
                endTime: newEnd,
                ...(role === "admin" && coverTrainerId ? { trainerId: coverTrainerId } : {}),
              }
        if (!target) throw new Error("Pick where the class moves to")
        const res = await fetch(`${apiBase}/${slot.id}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, target }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Couldn't move the class")
        setDoneMsg(
          `Class moved. ${data.notifiedClients ?? slot.bookedCount} client(s) got a fresh confirmation with the new time.`,
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong - try again")
      setBusy(false)
      return
    }
    setBusy(false)
    onDone()
  }

  const niceDate = (() => {
    try {
      return format(new Date(slot.date + "T00:00:00"), "EEE, MMM d")
    } catch {
      return slot.date
    }
  })()

  // Group move options by date so days read as sections.
  const byDate = (options ?? []).reduce<Record<string, MoveOption[]>>((acc, o) => {
    ;(acc[o.date] ??= []).push(o)
    return acc
  }, {})

  const moveReady =
    moveTab === "existing" ? !!picked : !!(newDate && newStart && newEnd)

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="font-semibold text-gray-800">Can&apos;t run this class?</div>
            <div className="text-sm text-gray-400 mt-0.5">
              {niceDate} · {formatTime12(slot.startTime)} · {slot.bookedCount} booked
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {doneMsg ? (
            <div className="py-4 text-center">
              <CheckCircle2 size={36} className="mx-auto text-brand" />
              <div className="mt-3 text-sm font-medium text-gray-700">{doneMsg}</div>
              <button
                onClick={onClose}
                className="mt-5 w-full py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark touch-manipulation"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Reason — staff-facing only; clients always get the warm template. */}
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Why? (only the studio sees this)
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {REASONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold border touch-manipulation",
                      reason === r.value
                        ? "bg-brand text-white border-brand"
                        : "bg-white text-gray-600 border-gray-200 hover:border-brand/40",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Action choice */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setMode(mode === "cancel" ? null : "cancel")}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left touch-manipulation",
                    mode === "cancel" ? "border-rose-500 bg-rose-50" : "border-gray-200 hover:border-rose-300",
                  )}
                >
                  <AlertTriangle size={16} className={mode === "cancel" ? "text-rose-600" : "text-gray-400"} />
                  <div className={cn("mt-1.5 text-sm font-semibold", mode === "cancel" ? "text-rose-700" : "text-gray-700")}>
                    Cancel class
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                    Everyone is notified, passes come back
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode(mode === "move" ? null : "move")}
                  disabled={slot.bookedCount === 0}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left touch-manipulation disabled:opacity-40",
                    mode === "move" ? "border-brand bg-brand/5" : "border-gray-200 hover:border-brand/40",
                  )}
                >
                  <CalendarClock size={16} className={mode === "move" ? "text-brand" : "text-gray-400"} />
                  <div className={cn("mt-1.5 text-sm font-semibold", mode === "move" ? "text-brand" : "text-gray-700")}>
                    Move class
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                    Whole group moves to a new time
                  </div>
                </button>
              </div>

              {mode === "cancel" && (
                <div className="mb-4 rounded-xl bg-rose-50 border border-rose-100 px-3 py-2.5 text-xs text-rose-700 leading-relaxed">
                  {slot.bookedCount > 0 ? (
                    <>
                      All <b>{slot.bookedCount}</b> booked client(s) get a WhatsApp message that the class is
                      cancelled. Pass classes return automatically. This can&apos;t be undone.
                    </>
                  ) : (
                    <>No one is booked - the class is simply taken off the schedule.</>
                  )}
                </div>
              )}

              {mode === "move" && (
                <div className="mb-4">
                  <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1">
                    {(["existing", "new"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMoveTab(t)}
                        className={cn(
                          "flex-1 py-1.5 rounded-md text-xs font-semibold touch-manipulation",
                          moveTab === t ? "bg-white text-gray-800 shadow-sm" : "text-gray-500",
                        )}
                      >
                        {t === "existing" ? "Existing class" : "New date & time"}
                      </button>
                    ))}
                  </div>

                  {moveTab === "existing" && (
                    <>
                      {options === null ? (
                        <div className="text-sm text-gray-400 py-2">Loading classes…</div>
                      ) : options.length === 0 ? (
                        <div className="text-sm text-gray-400 py-2">
                          No upcoming classes can take {slot.bookedCount} more - create a new date &amp; time instead.
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto space-y-3 pr-1">
                          {Object.entries(byDate).map(([date, opts]) => (
                            <div key={date}>
                              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                                {format(new Date(date + "T00:00:00"), "EEEE, MMM d")}
                              </div>
                              <div className="space-y-1">
                                {opts.map((o) => {
                                  const active = picked?.id === o.id
                                  return (
                                    <button
                                      key={o.id}
                                      type="button"
                                      onClick={() => setPicked(active ? null : o)}
                                      className={cn(
                                        "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left text-sm touch-manipulation",
                                        active
                                          ? "bg-brand text-white border-brand"
                                          : "bg-white text-gray-700 border-gray-200 hover:border-brand/40",
                                      )}
                                    >
                                      <span className="font-medium">
                                        {formatTime12(o.startTime)}
                                        {o.trainerName && (
                                          <span className={cn("font-normal", active ? "text-white/80" : "text-gray-400")}>
                                            {" "}
                                            · {o.mine ? "my class" : o.trainerName}
                                          </span>
                                        )}
                                      </span>
                                      <span className={cn("text-xs", active ? "text-white/80" : "text-gray-400")}>
                                        {o.spotsLeft} left
                                      </span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {moveTab === "new" && (
                    <div className="space-y-2">
                      <input
                        type="date"
                        value={newDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={newStart}
                          onChange={(e) => setNewStart(e.target.value)}
                          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                        />
                        <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />
                        <input
                          type="time"
                          value={newEnd}
                          onChange={(e) => setNewEnd(e.target.value)}
                          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand/30"
                        />
                      </div>
                      {role === "admin" && trainers && trainers.length > 0 && (
                        <select
                          value={coverTrainerId}
                          onChange={(e) => setCoverTrainerId(e.target.value)}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand/30 text-gray-600"
                          title="Trainer for the new time"
                        >
                          <option value="">Same trainer</option>
                          {trainers.map((t) => (
                            <option key={t.id} value={t.id}>
                              Cover: {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && <div className="mb-3 text-xs text-red-500">{error}</div>}

              {mode === "cancel" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className="w-full py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-60 touch-manipulation"
                >
                  {busy
                    ? "Cancelling…"
                    : slot.bookedCount > 0
                      ? `Cancel class - notify ${slot.bookedCount} client(s)`
                      : "Cancel class"}
                </button>
              )}
              {mode === "move" && (
                <button
                  type="button"
                  disabled={busy || !moveReady}
                  onClick={submit}
                  className="w-full py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark disabled:opacity-60 touch-manipulation"
                >
                  {busy ? "Moving…" : `Move class - notify ${slot.bookedCount} client(s)`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
