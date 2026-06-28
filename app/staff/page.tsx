"use client"

import { useCallback, useEffect, useState } from "react"
import { format, parseISO } from "date-fns"
import { Clock } from "lucide-react"

type Slot = { id: string; date: string; startTime: string; endTime: string; hasBookings: boolean }

const formatTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

// 7-day window: today + 6 days ahead, in the user's local time.
function buildWindow(): { from: string; to: string; days: string[] } {
  const today = new Date()
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    days.push(format(d, "yyyy-MM-dd"))
  }
  return { from: days[0], to: days[6], days }
}

export default function StaffSchedulePage() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [loaded, setLoaded] = useState(false)
  const [{ days, from, to }] = useState(buildWindow)

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff/slots?from=${from}&to=${to}`, { cache: "no-store" })
      if (res.ok) setSlots(await res.json())
    } finally {
      setLoaded(true)
    }
  }, [from, to])

  useEffect(() => {
    fetchSlots()
  }, [fetchSlots])

  // Auto-refresh every 60s + when the tab regains focus, so the cleaner always
  // sees the live schedule without manually reloading. Cheap (one read-only
  // query, 7-day window).
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      fetchSlots()
    }
    const id = setInterval(tick, 60_000)
    const onFocus = () => tick()
    const onVis = () => { if (document.visibilityState === "visible") tick() }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVis)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [fetchSlots])

  // Group slots by date for quick day-by-day lookup.
  const byDate = new Map<string, Slot[]>()
  for (const s of slots) {
    const list = byDate.get(s.date) ?? []
    list.push(s)
    byDate.set(s.date, list)
  }

  const todayStr = days[0]

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Next 7 days</h1>
      <p className="text-xs text-gray-500 mb-5">
        Time slots when a class is in the room. Green means guests are booked, grey means empty.
        Anything outside these blocks is free for cleaning.
      </p>

      {!loaded ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-3">
          {days.map((d) => {
            const date = parseISO(d + "T00:00:00")
            const list = byDate.get(d) ?? []
            const isToday = d === todayStr
            // Earliest class that actually has guests booked (list is already
            // ordered by start time) - so the cleaner knows when the first
            // people arrive and whether to hurry.
            const firstBooked = list.find((s) => s.hasBookings)
            return (
              <section
                key={d}
                className={
                  "rounded-2xl border bg-white px-4 py-3 " +
                  (isToday ? "border-brand/30 shadow-sm" : "border-gray-100")
                }
              >
                <header className="flex items-baseline justify-between gap-2 mb-2">
                  <div>
                    <div className="text-base font-semibold text-gray-900">
                      {format(date, "EEEE")}
                      {isToday && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{format(date, "MMMM d")}</div>
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                    {list.length === 0 ? "Free all day" : `${list.length} class${list.length === 1 ? "" : "es"}`}
                  </div>
                </header>

                {/* The headline the cleaner cares about: when do the first
                    guests arrive today/this day, or is it a calm morning. */}
                {list.length > 0 && (
                  <div className="mb-2">
                    {firstBooked ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 text-brand px-2.5 py-1 text-xs font-bold">
                        <Clock size={13} strokeWidth={2.5} />
                        First guests at {formatTime(firstBooked.startTime)}
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 text-gray-500 px-2.5 py-1 text-xs font-medium">
                        No bookings yet - no rush
                      </div>
                    )}
                  </div>
                )}

                {list.length === 0 ? (
                  // Whole-day free — the room can be cleaned at any time.
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-center">
                    <div className="text-sm font-medium text-gray-600">No classes</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Room is free all day.</div>
                  </div>
                ) : (
                  // Every class rendered the same way — one calm colour, one
                  // shape — so it's instantly clear which time blocks are
                  // taken and what's left between them.
                  <ul className="space-y-1.5">
                    {list.map((s) => (
                      <li
                        key={s.id}
                        className={
                          "flex items-center gap-3 rounded-xl border px-3 py-2.5 " +
                          (s.hasBookings ? "border-brand/20 bg-brand/[0.07]" : "border-gray-200 bg-gray-50")
                        }
                      >
                        <Clock size={16} className={(s.hasBookings ? "text-brand" : "text-gray-400") + " shrink-0"} strokeWidth={2.25} />
                        <div className="text-sm font-semibold text-gray-900 tabular-nums">
                          {formatTime(s.startTime)} - {formatTime(s.endTime)}
                        </div>
                        <div className="ml-auto text-[10px] uppercase tracking-wider font-semibold">
                          {s.hasBookings ? (
                            <span className="text-brand/80">Guests</span>
                          ) : (
                            <span className="text-gray-400">Empty</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
