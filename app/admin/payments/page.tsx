"use client"

import { useState, useEffect, useCallback } from "react"
import { Landmark, Check, Link2, Link2Off, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { PetalSpinner } from "@/app/_components/PetalSpinner"

type Suggestion = {
  id: string
  clientName: string
  date: string
  startTime: string
  classType: string
  trainerName: string | null
  price: number
  paymentType: string
  paymentStatus: string
  amountMatch: boolean
  alreadyLinked: boolean
}
type LinkedBooking = { id: string; clientName: string; date: string; startTime: string; classType: string }
type Payment = {
  id: string
  amount: number
  reference: string | null
  channel: string
  sender: string | null
  rawText: string
  paidAt: string
  paidDate: string
  paidTime: string
  matchedAt: string | null
  booking: LinkedBooking | null
  suggestions: Suggestion[]
}
type Feed = { payments: Payment[]; unmatchedCount: number; totalCount: number }

const fmt = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID")

export default function PaymentsPage() {
  const [filter, setFilter] = useState<"unmatched" | "all">("unmatched")
  const [data, setData] = useState<Feed | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openRaw, setOpenRaw] = useState<Record<string, boolean>>({})

  const fetchData = useCallback(async (f: "unmatched" | "all") => {
    setLoading(true)
    const res = await fetch(`/api/admin/payments?filter=${f}`, { cache: "no-store" })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(filter) }, [filter, fetchData])

  async function link(paymentId: string, bookingId: string | null) {
    setBusyId(paymentId)
    const res = await fetch(`/api/admin/payments/${paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    })
    setBusyId(null)
    if (res.ok) fetchData(filter)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Landmark size={22} className="text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bank confirmations</h1>
      </div>
      <p className="text-sm text-gray-400 mb-5">
        Incoming bank/QRIS payments from the studio SIM. Link each one to a booking - the trainer then
        sees a &quot;confirmed by bank&quot; mark. Clients never see this.
      </p>

      {/* Filter */}
      <div className="inline-flex rounded-xl bg-gray-100 dark:bg-white/5 p-1 mb-4">
        {(["unmatched", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 text-sm rounded-lg font-medium transition-colors",
              filter === f
                ? "bg-white dark:bg-white/10 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200",
            )}
          >
            {f === "unmatched" ? "To link" : "All"}
            {f === "unmatched" && data?.unmatchedCount ? (
              <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-xs">
                {data.unmatchedCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><PetalSpinner /></div>
      ) : !data || data.payments.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {filter === "unmatched" ? "Nothing to link - every payment is matched." : "No bank payments yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {data.payments.map((p) => (
            <div key={p.id} className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4">
              {/* Header row: amount + time */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(p.amount)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {p.channel} · {p.paidDate} {p.paidTime}
                    {p.reference ? <> · ref {p.reference}</> : null}
                  </div>
                </div>
                {p.booking ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-lg">
                    <Check size={13} /> Linked
                  </span>
                ) : null}
              </div>

              {/* Linked booking */}
              {p.booking ? (
                <div className="mt-3 flex items-center justify-between gap-3 bg-gray-50 dark:bg-white/5 rounded-xl px-3 py-2">
                  <div className="text-sm text-gray-700 dark:text-gray-200">
                    <span className="font-medium">{p.booking.clientName}</span>
                    <span className="text-gray-400"> · {p.booking.classType} · {p.booking.date} {p.booking.startTime}</span>
                  </div>
                  <button
                    onClick={() => link(p.id, null)}
                    disabled={busyId === p.id}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
                  >
                    <Link2Off size={14} /> Unlink
                  </button>
                </div>
              ) : (
                /* Suggestions to link */
                <div className="mt-3">
                  {p.suggestions.length === 0 ? (
                    <div className="text-xs text-gray-400">No bookings on {p.paidDate} to match. Check the schedule.</div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="text-xs text-gray-400 mb-1">Link to a booking on {p.paidDate}:</div>
                      {p.suggestions.map((s) => (
                        <div
                          key={s.id}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-xl px-3 py-2 border",
                            s.amountMatch
                              ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5"
                              : "border-gray-100 dark:border-white/10",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-gray-800 dark:text-gray-200 truncate">
                              <span className="font-medium">{s.startTime}</span> · {s.clientName}
                              {s.amountMatch ? (
                                <span className="ml-2 text-xs text-emerald-600">amount matches</span>
                              ) : null}
                            </div>
                            <div className="text-xs text-gray-400 truncate">
                              {s.classType} · {fmt(s.price)}
                              {s.trainerName ? <> · {s.trainerName}</> : null}
                              {s.alreadyLinked ? <span className="text-amber-600"> · already has a bank match</span> : null}
                            </div>
                          </div>
                          <button
                            onClick={() => link(p.id, s.id)}
                            disabled={busyId === p.id}
                            className="inline-flex items-center gap-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg flex-shrink-0"
                          >
                            <Link2 size={14} /> Link
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Raw SMS (collapsible, audit) */}
              <button
                onClick={() => setOpenRaw((o) => ({ ...o, [p.id]: !o[p.id] }))}
                className="mt-3 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                {openRaw[p.id] ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Raw SMS
              </button>
              {openRaw[p.id] ? (
                <pre className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 rounded-lg p-2.5 whitespace-pre-wrap break-words">
                  {p.rawText}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
