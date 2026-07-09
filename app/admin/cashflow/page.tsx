"use client"

import { useState, useEffect, useCallback } from "react"
import { format, addMonths, subMonths } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, TrendingUp, TrendingDown, Wallet, ClipboardCheck, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { AddExpenseModal } from "@/app/_components/AddExpenseModal"

type Method = "CASH" | "EDC" | "QR" | "TRANSFER"
type IncomeRow = { id: string; date: string; label: string; responsible: string; method: Method; amount: number; kind: "class" | "membership" | "service" }
type ExpenseRow = { id: string; date: string; description: string; amount: number; kind: "expense" | "payout" }
type CashCount = { id: string; counted: number; expected: number; difference: number; note: string | null; createdAt: string }
type CashFlow = {
  month: string
  monthLabel: string
  income: IncomeRow[]
  incomeTotals: Record<Method, number> & { total: number }
  expenseRows: ExpenseRow[]
  expenseTotal: number
  net: number
  // Running (all-time, CASH only) register reconciliation.
  cashInAllTime: number
  cashExpensesAllTime: number
  cashPayoutsAllTime: number
  expectedInDrawer: number
  // Month-scoped cash ledger lines (carried over + in - out = expected).
  carriedOver: number
  monthCashIn: number
  monthCashOut: number
  monthAbsorbed: number
  lastCount: { counted: number; difference: number; note: string | null; createdAt: string } | null
  counts: CashCount[]
}

const fmt = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID")
const fmtCell = (n: number) => (n ? Math.round(n).toLocaleString("id-ID") : "")
const METHOD_COLS: { key: Method; label: string }[] = [
  { key: "CASH", label: "Cash" },
  { key: "EDC", label: "EDC" },
  { key: "QR", label: "QRIS" },
  { key: "TRANSFER", label: "Transfer" },
]

export default function CashFlowPage() {
  const [anchor, setAnchor] = useState(new Date())
  const [data, setData] = useState<CashFlow | null>(null)
  const [loading, setLoading] = useState(true)
  // "Add expense" right on this page (Sveta looked for it here, not on Salary).
  const [showExpense, setShowExpense] = useState(false)
  // Cash recount / reconcile control.
  const [showCount, setShowCount] = useState(false)
  const [countAmount, setCountAmount] = useState("")
  const [countNote, setCountNote] = useState("")
  const [counting, setCounting] = useState(false)
  const [countError, setCountError] = useState<string | null>(null)

  const fetchData = useCallback(async (date: Date) => {
    setLoading(true)
    const res = await fetch(`/api/admin/cashflow?month=${format(date, "yyyy-MM")}`, { cache: "no-store" })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  const submitCount = async (e: React.FormEvent) => {
    e.preventDefault()
    setCounting(true)
    setCountError(null)
    const res = await fetch("/api/admin/cash-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counted: Number(countAmount), note: countNote || undefined }),
    })
    setCounting(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setCountError(j.error ?? "Couldn't save - try again.")
      return
    }
    setShowCount(false)
    setCountAmount("")
    setCountNote("")
    fetchData(anchor)
  }

  useEffect(() => { fetchData(anchor) }, [anchor, fetchData])

  const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const canGoForward = new Date(anchor.getFullYear(), anchor.getMonth(), 1).getTime() < currentMonthStart.getTime()

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Cash Flow</h1>
      <p className="text-sm text-gray-400 mb-5">Daily money in &amp; out - built automatically from bookings, passes and expenses.</p>

      {/* Month switcher */}
      <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm p-3 mb-4 max-w-md">
        <button onClick={() => setAnchor(subMonths(anchor, 1))} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100" aria-label="Previous month">
          <ChevronLeft size={20} />
        </button>
        <div className="text-sm font-semibold text-gray-800">{data?.monthLabel ?? format(anchor, "MMMM yyyy")}</div>
        <button onClick={() => canGoForward && setAnchor(addMonths(anchor, 1))} disabled={!canGoForward} className={cn("w-10 h-10 flex items-center justify-center rounded-lg", canGoForward ? "text-gray-500 hover:text-gray-800 hover:bg-gray-100" : "text-gray-300 cursor-not-allowed")} aria-label="Next month">
          <ChevronRight size={20} />
        </button>
      </div>

      {loading || !data ? (
        <div className="bg-white rounded-2xl shadow-sm"><PetalSpinner /></div>
      ) : (
        <div className="space-y-5">
          {/* Summary — the month's money in / out (all methods). */}
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard icon={TrendingUp} label={`Money in · ${data.monthLabel}`} value={fmt(data.incomeTotals.total)} color="green" />
            <SummaryCard icon={TrendingDown} label={`Money out · ${data.monthLabel}`} value={fmt(data.expenseTotal)} color="red" />
          </div>

          {/* CASH IN REGISTER — control figure (Sveta 06.07). "Expected" is
              built from cash-in − cash-out − past recount differences; count
              the drawer to reconcile. Only CASH counts. */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand flex items-center justify-center"><Wallet size={16} /></span>
                <span className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Cash register control</span>
              </div>
              <button
                onClick={() => { setCountAmount(""); setCountNote(""); setCountError(null); setShowCount(true) }}
                className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-3 py-1.5 text-xs font-semibold hover:bg-brand/15 active:scale-95 transition touch-manipulation"
              >
                <ClipboardCheck size={13} /> Count cash
              </button>
            </div>
            {/* Month ledger (Sveta 10.07): carried over + this month's cash
                in - this month's cash out = expected. The old all-time lines
                hid income from previous months and read as a formula error. */}
            <div className="text-sm space-y-1.5">
              <div className="flex justify-between gap-3"><span className="text-gray-500">Carried over (before {data.monthLabel.split(" ")[0]})</span><span className="font-medium tabular-nums text-gray-700">{fmt(data.carriedOver)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-500">Cash in · {data.monthLabel.split(" ")[0]}</span><span className="font-medium tabular-nums text-green-600">+{fmt(data.monthCashIn)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-500">Cash out · {data.monthLabel.split(" ")[0]}</span><span className="font-medium tabular-nums text-red-500">−{fmt(data.monthCashOut)}</span></div>
              {data.monthAbsorbed !== 0 && (
                <div className="flex justify-between gap-3"><span className="text-gray-500">Recount adjustments · {data.monthLabel.split(" ")[0]}</span><span className="font-medium tabular-nums text-amber-600">−{fmt(data.monthAbsorbed)}</span></div>
              )}
              <div className="flex justify-between gap-3 border-t border-gray-200 pt-2 mt-1">
                <span className="font-semibold text-gray-800">Should be in the drawer</span>
                <span className={cn("font-bold tabular-nums text-lg", data.expectedInDrawer < 0 ? "text-red-500" : "text-gray-900")}>{fmt(data.expectedInDrawer)}</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 leading-snug">
              Only cash payments count - card, QRIS and transfers never touch the drawer. Count the drawer and tap &quot;Count cash&quot; to reconcile: any gap is logged.
            </p>

            {data.counts.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Recounts</div>
                <div className="space-y-1.5">
                  {data.counts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-500 min-w-0 truncate">
                        {format(new Date(c.createdAt), "MMM d, HH:mm")} · counted {fmt(c.counted)}
                        {c.note ? <span className="text-gray-400"> - {c.note}</span> : null}
                      </span>
                      <span className={cn("font-semibold tabular-nums flex-shrink-0",
                        c.difference > 0 ? "text-red-500" : c.difference < 0 ? "text-amber-600" : "text-green-600")}>
                        {c.difference === 0 ? "matched" : c.difference > 0 ? `short ${fmt(c.difference)}` : `over ${fmt(-c.difference)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* INCOME */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-800">Money in</span>
              <span className="text-xs text-gray-400">{data.income.length} entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-gray-400 bg-gray-50">
                    <th className="text-left font-semibold px-4 py-2">Date</th>
                    <th className="text-left font-semibold px-4 py-2">Description</th>
                    <th className="text-left font-semibold px-4 py-2 hidden sm:table-cell">By</th>
                    {METHOD_COLS.map((m) => <th key={m.key} className="text-right font-semibold px-4 py-2">{m.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.income.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No income recorded this month.</td></tr>
                  ) : data.income.map((r) => (
                    <tr key={r.id} className="border-t border-gray-50">
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{format(new Date(r.date), "MMM d")}</td>
                      <td className="px-4 py-2 text-gray-800">
                        {r.label}
                        {r.kind === "membership" && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand/10 text-brand">card</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{r.responsible}</td>
                      {METHOD_COLS.map((m) => <td key={m.key} className="px-4 py-2 text-right tabular-nums text-gray-700">{r.method === m.key ? fmtCell(r.amount) : ""}</td>)}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-gray-900">
                    {/* The "By" column is hidden on mobile, so the label cell
                        must NOT span it there - a fixed colSpan={3} pushed
                        every method total one column to the right (Sveta's
                        "cash shows under EDC" report). Mirror the header:
                        span 2 always + one extra cell that hides with "By". */}
                    <td className="px-4 py-2.5" colSpan={2}>TOTAL · {fmt(data.incomeTotals.total)}</td>
                    <td className="hidden sm:table-cell" />
                    {METHOD_COLS.map((m) => <td key={m.key} className="px-4 py-2.5 text-right tabular-nums">{fmtCell(data.incomeTotals[m.key])}</td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* EXPENSES */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <span className="font-semibold text-gray-800">Money out</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{data.expenseRows.length} entries</span>
                <button
                  onClick={() => setShowExpense(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-3 py-1.5 text-xs font-semibold hover:bg-brand/15 active:scale-95 transition touch-manipulation"
                >
                  <Plus size={13} /> Add expense
                </button>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 bg-gray-50">
                  <th className="text-left font-semibold px-4 py-2">Date</th>
                  <th className="text-left font-semibold px-4 py-2">Description</th>
                  <th className="text-right font-semibold px-4 py-2">Cash out</th>
                </tr>
              </thead>
              <tbody>
                {data.expenseRows.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No expenses recorded this month.</td></tr>
                ) : data.expenseRows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{format(new Date(r.date), "MMM d")}</td>
                    <td className="px-4 py-2 text-gray-800">
                      {r.description}
                      {r.kind === "payout" && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">salary</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{fmtCell(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-gray-900">
                  <td className="px-4 py-2.5" colSpan={2}>TOTAL</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtCell(data.expenseTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-gray-400 px-2">
            Money in = per-class payments (cash, EDC, QRIS, transfer) plus pass sales. Classes paid from a
            pass are not counted again here. Money out = expenses (add them here or on the Salary page)
            plus salary payouts.
          </p>
        </div>
      )}

      {showExpense && (
        <AddExpenseModal onClose={() => setShowExpense(false)} onSaved={() => fetchData(anchor)} />
      )}

      {/* Cash recount / reconcile */}
      {showCount && data && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Count the drawer</h2>
              <button onClick={() => setShowCount(false)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 text-sm flex justify-between">
              <span className="text-gray-500">System expects</span>
              <span className="font-semibold tabular-nums">{fmt(data.expectedInDrawer)}</span>
            </div>
            <form onSubmit={submitCount} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Actually counted (IDR)</label>
                <input
                  type="number" required min="0" step="any" value={countAmount}
                  onChange={(e) => setCountAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder="0"
                />
                {countAmount !== "" && (() => {
                  const diff = data.expectedInDrawer - Number(countAmount)
                  return (
                    <p className={cn("text-xs mt-1 font-medium", diff > 0 ? "text-red-500" : diff < 0 ? "text-amber-600" : "text-green-600")}>
                      {diff === 0 ? "Matches the system exactly." : diff > 0 ? `Short by ${fmt(diff)} - missing from the drawer.` : `Over by ${fmt(-diff)} - more than expected.`}
                    </p>
                  )
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (e.g. deposited to bank)</label>
                <input
                  type="text" value={countNote}
                  onChange={(e) => setCountNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder="Optional - explain any gap"
                />
              </div>
              {countError && <div className="text-xs text-red-500">{countError}</div>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCount(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={counting} className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-medium hover:bg-brand-dark disabled:opacity-60">
                  {counting ? "Saving..." : "Save count"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string; color: "green" | "red" | "brand" }) {
  const tone = color === "green" ? "text-green-600 bg-green-50" : color === "red" ? "text-red-500 bg-red-50" : "text-brand bg-brand/10"
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center", tone)}><Icon size={16} /></span>
        <span className="text-xs uppercase tracking-wide text-gray-400 font-semibold">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}
