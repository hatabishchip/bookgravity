"use client"

import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { Banknote, MinusCircle, Scale, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { formatIDRCompact as formatIDR } from "@/lib/format"

// Trainer cash safes: how much cash each trainer's box should hold right now.
// Inflow is derived from CASH payment records; this page records what LEAVES
// the box (owner withdrawals) and recount corrections. Salary payouts from a
// safe are recorded on the Salary page's pay-out modal.

type Balance = { trainerId: string; trainerName: string; cashIn: number; opsTotal: number; balance: number }
type Operation = { id: string; trainerId: string; trainerName: string; kind: string; amount: number; note: string | null; createdAt: string }
type SafeData = { balances: Balance[]; total: number; operations: Operation[] }

const KIND_LABEL: Record<string, string> = {
  withdrawal: "Taken from safe",
  salary: "Salary from safe",
  correction: "Correction",
}

export default function SafePage() {
  const [data, setData] = useState<SafeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [disabled, setDisabled] = useState(false)
  // Operation modal: withdraw cash from a trainer's box, or fix the number
  // after a physical recount ("the box actually holds Y").
  const [opFor, setOpFor] = useState<Balance | null>(null)
  const [opKind, setOpKind] = useState<"withdrawal" | "correction">("withdrawal")
  const [opAmount, setOpAmount] = useState("")
  const [opActual, setOpActual] = useState("")
  const [opNote, setOpNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [opError, setOpError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/safe", { cache: "no-store" })
    if (res.status === 404) { setDisabled(true); setLoading(false); return }
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => { fetchData() }, [fetchData])

  const openOp = (b: Balance) => {
    setOpFor(b)
    setOpKind("withdrawal")
    setOpAmount("")
    setOpActual("")
    setOpNote("")
    setOpError(null)
  }

  const submitOp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!opFor) return
    setSaving(true)
    setOpError(null)
    // A correction is entered as "the box actually holds Y" — the API stores
    // the signed delta so the balance lands exactly on Y.
    const amount = opKind === "withdrawal" ? Number(opAmount) : Number(opActual) - opFor.balance
    if (opKind === "correction" && amount === 0) {
      setOpError("The safe already shows that amount - nothing to correct.")
      setSaving(false)
      return
    }
    const res = await fetch("/api/admin/safe/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: opKind, trainerId: opFor.trainerId, amount, note: opNote || (opKind === "correction" ? undefined : undefined) }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setOpError(j.error ?? "Couldn't save - try again.")
      return
    }
    setOpFor(null)
    await fetchData()
  }

  if (loading) return <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm"><PetalSpinner /></div>
  if (disabled || !data) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Safes</h1>
        <p className="text-sm text-gray-400">Cash-safe tracking is not enabled for this studio.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Safes</h1>
      <p className="text-sm text-gray-400 mb-5">
        Cash each trainer&apos;s safe should hold - built from cash payments minus what was taken out.
      </p>

      {/* Studio total */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center"><Banknote size={20} /></span>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Total cash in safes</div>
          <div className="text-2xl font-bold text-gray-900">{formatIDR(data.total)}</div>
        </div>
      </div>

      {/* Per-trainer safes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        {data.balances.map((b) => (
          <div key={b.trainerId} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-gray-800 truncate">{b.trainerName}</div>
              <button
                onClick={() => openOp(b)}
                className="flex-shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-brand/40 touch-manipulation"
              >
                Withdraw / Correct
              </button>
            </div>
            <div className={cn("text-2xl font-bold mt-1", b.balance < 0 ? "text-red-500" : "text-gray-900")}>
              {formatIDR(b.balance)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {formatIDR(b.cashIn)} cash collected all time
            </div>
          </div>
        ))}
        {data.balances.length === 0 && (
          <div className="text-sm text-gray-400 col-span-full">No active trainers.</div>
        )}
      </div>

      {/* Operations history */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">History</div>
        {data.operations.length === 0 ? (
          <div className="px-5 py-6 text-sm text-gray-400">No operations yet - only incoming cash so far.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.operations.map((o) => (
              <div key={o.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                  o.kind === "correction" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-500",
                )}>
                  {o.kind === "correction" ? <Scale size={14} /> : <MinusCircle size={14} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-800">
                    {KIND_LABEL[o.kind] ?? o.kind} · {o.trainerName}
                    {o.note && <span className="text-gray-400"> - {o.note}</span>}
                  </div>
                  <div className="text-xs text-gray-400">{format(new Date(o.createdAt), "MMM d, HH:mm")}</div>
                </div>
                <div className={cn("font-semibold tabular-nums", o.amount < 0 ? "text-red-500" : "text-green-600")}>
                  {o.amount < 0 ? "-" : "+"}{formatIDR(Math.abs(o.amount))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Withdraw / correction modal */}
      {opFor && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{opFor.trainerName}&apos;s safe</h2>
                <p className="text-sm text-gray-400 mt-0.5">Now: {formatIDR(opFor.balance)}</p>
              </div>
              <button onClick={() => setOpFor(null)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
              {(["withdrawal", "correction"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setOpKind(k)}
                  className={cn(
                    "flex-1 py-1.5 rounded-md text-xs font-semibold touch-manipulation",
                    opKind === k ? "bg-white text-gray-800 shadow-sm" : "text-gray-500",
                  )}
                >
                  {k === "withdrawal" ? "Take cash out" : "Recount correction"}
                </button>
              ))}
            </div>

            <form onSubmit={submitOp} className="space-y-3">
              {opKind === "withdrawal" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount taken (IDR)</label>
                  <input
                    type="number" required min="1" step="any" value={opAmount}
                    onChange={(e) => setOpAmount(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    placeholder="0"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">The safe actually holds (IDR)</label>
                  <input
                    type="number" required min="0" step="any" value={opActual}
                    onChange={(e) => setOpActual(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    placeholder="Counted amount"
                  />
                  {opActual !== "" && (
                    <p className="text-xs text-gray-400 mt-1">
                      Correction: {Number(opActual) - opFor.balance >= 0 ? "+" : "-"}{formatIDR(Math.abs(Number(opActual) - opFor.balance))}
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {opKind === "correction" ? "Reason (required)" : "Note (optional)"}
                </label>
                <input
                  type="text" value={opNote} required={opKind === "correction"}
                  onChange={(e) => setOpNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder={opKind === "correction" ? "e.g. Recount on July 6" : "e.g. Taken by owner"}
                />
              </div>
              {opError && <div className="text-xs text-red-500">{opError}</div>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setOpFor(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-medium hover:bg-brand-dark disabled:opacity-60">
                  {saving ? "Saving..." : opKind === "withdrawal" ? "Take out" : "Apply correction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
