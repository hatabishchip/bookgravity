"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { CalendarX, CheckCircle2, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime12 } from "@/lib/format"

// "Client's classes" sheet - opened from the chat composer's calendar-x
// button. Shows THIS client's upcoming bookings so staff can move or cancel
// one right where the client asked for it (the chat), instead of hunting the
// client down on the bookings page. Move/cancel go through the existing
// role endpoints, so the client gets the same WhatsApp confirmations and
// pass classes return automatically.

export type ChatBooking = {
  id: string
  slotId: string
  date: string
  startTime: string
  endTime: string
  classType: string
  trainerName: string | null
  canManage: boolean
}

type MoveOption = {
  id: string
  date: string
  startTime: string
  endTime: string
  classType: string
  trainerName: string | null
  spotsLeft: number
}

function niceDate(d: string): string {
  try {
    return format(new Date(d + "T00:00:00"), "EEE, MMM d")
  } catch {
    return d
  }
}

export default function ChatBookingSheet({
  role,
  clientName,
  bookings,
  onClose,
  onChanged,
}: {
  role: "ADMIN" | "TRAINER"
  clientName: string | null
  bookings: ChatBooking[]
  onClose: () => void
  /** Re-fetch the bookings after a successful move/cancel. */
  onChanged: () => void
}) {
  // Per-booking expanded action: none | move (target list) | cancel (confirm).
  const [action, setAction] = useState<{ bookingId: string; mode: "move" | "cancel" } | null>(null)
  const [options, setOptions] = useState<MoveOption[] | null>(null)
  const [picked, setPicked] = useState<MoveOption | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  const apiBase = role === "TRAINER" ? "/api/trainer/bookings" : "/api/admin/bookings"

  // Load move destinations once a move opens (shared across bookings).
  useEffect(() => {
    if (action?.mode !== "move" || options !== null) return
    let alive = true
    ;(async () => {
      try {
        if (role === "TRAINER") {
          const res = await fetch("/api/trainer/reschedule-options")
          const all: (MoveOption & { mine?: boolean })[] = await res.json()
          if (alive) setOptions(all.filter((o) => o.spotsLeft >= 1))
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
                .filter((s) => s.trainerId && s.maxCapacity - s._count.bookings >= 1)
                .map((s) => ({
                  id: s.id,
                  date: s.date,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  classType: s.classType,
                  trainerName: s.trainer?.name ?? null,
                  spotsLeft: s.maxCapacity - s._count.bookings,
                })),
            )
        }
      } catch {
        if (alive) setOptions([])
      }
    })()
    return () => {
      alive = false
    }
  }, [action, options, role])

  const act = async (bookingId: string, body: Record<string, unknown>, successMsg: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Something went wrong - try again")
      setDoneMsg(successMsg)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong - try again")
    }
    setBusy(false)
  }

  // Group move options by date so days read as sections.
  const byDate = (options ?? []).reduce<Record<string, MoveOption[]>>((acc, o) => {
    ;(acc[o.date] ??= []).push(o)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="font-semibold text-gray-800 flex items-center gap-2">
              <CalendarX size={18} className="text-amber-600" />
              {clientName ? `${clientName}'s classes` : "Client's classes"}
            </div>
            <div className="text-sm text-gray-400 mt-0.5">
              Move or cancel a booking - the client gets a WhatsApp message.
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
          ) : bookings.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">
              No upcoming classes for this client.
            </div>
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => {
                const open = action?.bookingId === b.id ? action.mode : null
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "rounded-xl border p-3",
                      b.canManage ? "border-gray-200" : "border-gray-100 opacity-60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-gray-800">
                          {niceDate(b.date)} · {formatTime12(b.startTime)}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {b.trainerName ? `with ${b.trainerName}` : "no trainer yet"}
                        </div>
                      </div>
                      {b.canManage ? (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setPicked(null)
                              setError(null)
                              setAction(open === "move" ? null : { bookingId: b.id, mode: "move" })
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-xs font-semibold border touch-manipulation",
                              open === "move"
                                ? "bg-brand text-white border-brand"
                                : "bg-white text-gray-600 border-gray-200 hover:border-brand/40",
                            )}
                          >
                            Move
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setError(null)
                              setAction(open === "cancel" ? null : { bookingId: b.id, mode: "cancel" })
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-xs font-semibold border touch-manipulation",
                              open === "cancel"
                                ? "bg-red-600 text-white border-red-600"
                                : "bg-white text-red-600 border-red-200 hover:border-red-400",
                            )}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] text-gray-400 max-w-[130px] text-right">
                          Only this class&apos;s coach can change it
                        </div>
                      )}
                    </div>

                    {open === "cancel" && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="text-xs text-gray-500 mb-2">
                          Cancel this class for {clientName || "the client"}? They get a WhatsApp
                          message; a pass class returns automatically.
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            act(
                              b.id,
                              { status: "CANCELLED" },
                              "Cancelled. The client got a WhatsApp message.",
                            )
                          }
                          className="w-full py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 touch-manipulation"
                        >
                          {busy ? "Cancelling..." : "Yes, cancel it"}
                        </button>
                      </div>
                    )}

                    {open === "move" && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {options === null ? (
                          <div className="text-xs text-gray-400 py-2">Loading classes...</div>
                        ) : (
                          <>
                            <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                              {Object.entries(byDate)
                                .filter(([, list]) => list.some((o) => o.id !== b.slotId))
                                .map(([date, list]) => (
                                  <div key={date}>
                                    <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                                      {niceDate(date)}
                                    </div>
                                    {list
                                      .filter((o) => o.id !== b.slotId)
                                      .map((o) => (
                                        <button
                                          key={o.id}
                                          type="button"
                                          onClick={() => setPicked(picked?.id === o.id ? null : o)}
                                          className={cn(
                                            "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs mb-1 touch-manipulation",
                                            picked?.id === o.id
                                              ? "border-brand bg-brand/5"
                                              : "border-gray-100 hover:border-gray-300",
                                          )}
                                        >
                                          <span className="font-medium text-gray-700">
                                            {formatTime12(o.startTime)}
                                            {o.trainerName ? ` · ${o.trainerName}` : ""}
                                          </span>
                                          <span className="text-gray-400">
                                            {o.spotsLeft} spot{o.spotsLeft === 1 ? "" : "s"}
                                          </span>
                                        </button>
                                      ))}
                                  </div>
                                ))}
                              {options.length === 0 && (
                                <div className="text-xs text-gray-400 py-2">
                                  No classes with free spots in the next 60 days.
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={busy || !picked}
                              onClick={() =>
                                picked &&
                                act(
                                  b.id,
                                  { slotId: picked.id },
                                  "Moved. The client got a fresh confirmation with the new time.",
                                )
                              }
                              className="mt-2 w-full py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark disabled:opacity-50 touch-manipulation"
                            >
                              {busy ? "Moving..." : picked ? "Move here" : (
                                <span className="inline-flex items-center gap-1">
                                  Pick a class above <ChevronDown size={14} />
                                </span>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {error && !doneMsg && (
            <div className="mt-3 text-xs text-red-600">{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}
