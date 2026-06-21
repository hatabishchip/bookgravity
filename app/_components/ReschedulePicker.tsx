"use client"

import { useState } from "react"
import { format } from "date-fns"
import { CheckCircle2, CalendarClock } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime12 } from "@/lib/format"

// Shared "move this booking to another class" picker for the trainer cabinet.
// Used in BOTH trainer views — All My Bookings AND the My Schedule class view
// (trainers Dita/Seni live on the schedule page and never saw the bookings-page
// version, incident 2026-06-12). The parent owns the PATCH call via onMove so
// each page keeps its own state-refresh strategy.

type RescheduleOption = {
  id: string
  date: string
  startTime: string
  endTime: string
  classType: string
  trainerName: string | null
  mine: boolean
  spotsLeft: number
}

export function ReschedulePicker({
  excludeSlotId,
  disabled,
  onMove,
}: {
  /** Current class — hidden from the target list. */
  excludeSlotId?: string
  disabled?: boolean
  /** Performs the move (PATCH {slotId}). Resolve false to show an error. */
  onMove: (slotId: string) => Promise<boolean | void> | boolean | void
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<RescheduleOption[] | null>(null)
  const [picked, setPicked] = useState<RescheduleOption | null>(null)
  const [moving, setMoving] = useState(false)
  const [movedTo, setMovedTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    setError(null)
    if (next && options === null) {
      try {
        const res = await fetch("/api/trainer/reschedule-options")
        const all: RescheduleOption[] = await res.json()
        setOptions(all.filter((o) => o.id !== excludeSlotId))
      } catch {
        setOptions([])
      }
    }
  }

  const confirmMove = async () => {
    if (!picked) return
    setMoving(true)
    setError(null)
    const ok = await onMove(picked.id)
    setMoving(false)
    if (ok === false) {
      setError("Couldn't move the booking - the class may be full. Try another one.")
      return
    }
    setMovedTo(`${format(new Date(picked.date), "EEE, MMM d")} · ${formatTime12(picked.startTime)}`)
    setOpen(false)
    setPicked(null)
    setOptions(null) // refetch next time — capacities changed
  }

  // Group options by date so days read as sections, not one long list.
  const byDate = (options ?? []).reduce<Record<string, RescheduleOption[]>>((acc, o) => {
    ;(acc[o.date] ??= []).push(o)
    return acc
  }, {})

  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100">
      {/* One control: the whole header row toggles the picker, so it never
          looks like two separate actions ("Reschedule" + "Move to another
          class"). Reschedule and Cancel are kept clearly distinct. */}
      <button
        type="button"
        disabled={disabled || moving}
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 disabled:opacity-50 touch-manipulation"
      >
        <span className="flex items-center gap-1.5">
          <CalendarClock size={14} className="text-brand" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reschedule</span>
        </span>
        <span className="text-xs font-medium text-brand">
          {open ? "Close" : "Change class"}
        </span>
      </button>

      {movedTo && !open && (
        <div className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand bg-brand/5 border border-brand/20 rounded-lg px-3 py-2">
          <CheckCircle2 size={14} /> Moved to {movedTo}. The client got a new confirmation.
        </div>
      )}

      {open && (
        <div className="mt-3">
          {options === null ? (
            <div className="text-sm text-gray-400 py-2">Loading classes…</div>
          ) : options.length === 0 ? (
            <div className="text-sm text-gray-400 py-2">No upcoming classes with free spots.</div>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
              {Object.entries(byDate).map(([date, opts]) => (
                <div key={date}>
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    {format(new Date(date), "EEEE, MMM d")}
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
                              : "bg-white text-gray-700 border-gray-200 hover:border-brand/40"
                          )}
                        >
                          <span className="font-medium">
                            {formatTime12(o.startTime)}
                            {o.classType !== "GROUP" && (
                              <span className={cn("ml-1.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded", active ? "bg-white/20 text-white" : "bg-amber-50 text-amber-600")}>
                                {o.classType === "PRIVATE" ? "Private" : o.classType === "KIDS" ? "Kids" : o.classType}
                              </span>
                            )}
                            {o.trainerName && (
                              <span className={cn("font-normal", active ? "text-white/80" : "text-gray-400")}>
                                {" "}· {o.mine ? "my class" : o.trainerName}
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

          {error && <div className="mt-2 text-xs text-red-500">{error}</div>}

          {picked && (
            <button
              type="button"
              disabled={moving}
              onClick={confirmMove}
              className="w-full mt-3 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark disabled:opacity-60 touch-manipulation"
            >
              {moving
                ? "Moving…"
                : `Confirm: move to ${format(new Date(picked.date), "MMM d")}, ${formatTime12(picked.startTime)}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
