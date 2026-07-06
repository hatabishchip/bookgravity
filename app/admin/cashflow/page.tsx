"use client"

import { useState, useEffect, useCallback } from "react"
import { format, addMonths, subMonths } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, TrendingUp, TrendingDown, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { AddExpenseModal } from "@/app/_components/AddExpenseModal"

type Method = "CASH" | "EDC" | "QR" | "TRANSFER"
type IncomeRow = { id: string; date: string; label: string; responsible: string; method: Method; amount: number; kind: "class" | "membership" | "service" }
type ExpenseRow = { id: string; date: string; description: string; amount: number; kind: "expense" | "payout" }
type CashFlow = {
  month: string
  monthLabel: string
  income: IncomeRow[]
  incomeTotals: Record<Method, number> & { total: number }
  expenseRows: ExpenseRow[]
  expenseTotal: number
  net: number
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

  const fetchData = useCallback(async (date: Date) => {
    setLoading(true)
    const res = await fetch(`/api/admin/cashflow?month=${format(date, "yyyy-MM")}`, { cache: "no-store" })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

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
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard icon={TrendingUp} label="Money in" value={fmt(data.incomeTotals.total)} color="green" />
            <SummaryCard icon={TrendingDown} label="Money out" value={fmt(data.expenseTotal)} color="red" />
            {/* "Cash movement", not "Net": this is CASH IN minus CASH OUT
                (payouts included, membership-paid classes excluded). The
                Salary page's "Operating profit" is accrual-based - the two
                legitimately differ; unlabeled they looked contradictory. */}
            <SummaryCard icon={Wallet} label="Cash movement" value={fmt(data.net)} color={data.net >= 0 ? "brand" : "red"} />
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
                        {r.kind === "membership" && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand/10 text-brand">pass</span>}
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
