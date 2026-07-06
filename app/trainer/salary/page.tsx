"use client"

import { useState, useEffect, useCallback } from "react"
import { format, addMonths, subMonths, startOfMonth } from "date-fns"
import { ChevronLeft, ChevronRight, Banknote, Users, HandHelping, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { formatIDRCompact as formatIDR } from "@/lib/format"
import { paymentTypeLabel, classTypeLabel, PRICE_TIER_LABEL } from "@/lib/payments"
import { format as formatDate, parseISO } from "date-fns"

type BreakdownRow = {
  bookingId: string
  date: string
  startTime: string
  classType: string
  client: string
  paymentType: string
  tier?: string | null
  amount: number
  rate: number
  commission: number
  role: "lead" | "assistant"
}

type Salary = {
  baseSalary: number
  commissionRate: number
  assistantRate: number
  totalPaid: number
  mainCommission: number
  assistantCommission: number
  commission: number
  total: number
  paidBookingsCount: number
  sessionsWorked: number
  assistedCount: number
  breakdown: BreakdownRow[]
  month: string
  monthLabel: string
}

// Full-rupiah format for the per-class list, so a trainer can add the rows up
// and match the total (the headline cards use the compact 1.2M style).
const fmtFull = (n: number) => "Rp " + n.toLocaleString("en-US")

// formatIDR now lives in lib/format (formatIDRCompact) — the local copy
// carried the toFixed(1) bug that rendered 1.35M as "1.4M".

type SafeInfo = {
  balance: number
  operations: { id: string; kind: string; amount: number; note: string | null; createdAt: string }[]
}

export default function TrainerSalaryPage() {
  const [anchor, setAnchor] = useState(startOfMonth(new Date()))
  const [salary, setSalary] = useState<Salary | null>(null)
  const [loading, setLoading] = useState(true)
  // Cash-safe card (safe feature). null = feature off for this studio (404).
  const [safe, setSafe] = useState<SafeInfo | null>(null)

  useEffect(() => {
    fetch("/api/trainer/safe", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSafe(d))
      .catch(() => {})
  }, [])

  const fetchSalary = useCallback(async (date: Date) => {
    setLoading(true)
    const monthStr = format(date, "yyyy-MM")
    const res = await fetch(`/api/trainer/salary?month=${monthStr}`)
    if (res.ok) {
      const data = await res.json()
      setSalary(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSalary(anchor) }, [anchor, fetchSalary])

  const currentMonthStart = startOfMonth(new Date())
  // Salary tracking started in May 2026 — earlier months would only show zeros
  const minMonth = new Date(2026, 4, 1) // May = month index 4
  const canGoForward = anchor.getTime() < currentMonthStart.getTime()
  const canGoBack = anchor.getTime() > minMonth.getTime()

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Salary</h1>

      {/* Month switcher */}
      <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm p-3 mb-4">
        <button
          onClick={() => canGoBack && setAnchor(subMonths(anchor, 1))}
          disabled={!canGoBack}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-lg",
            canGoBack ? "text-gray-500 hover:text-gray-800 hover:bg-gray-100" : "text-gray-300 cursor-not-allowed"
          )}
          aria-label="Previous month"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-800">
            {salary?.monthLabel ?? format(anchor, "MMMM yyyy")}
          </div>
          {!canGoForward && (
            <div className="text-[10px] text-brand font-medium mt-0.5">Current month</div>
          )}
        </div>
        <button
          onClick={() => setAnchor(addMonths(anchor, 1))}
          disabled={!canGoForward}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-lg transition-colors",
            canGoForward ? "text-gray-500 hover:text-gray-800 hover:bg-gray-100" : "text-gray-300 cursor-not-allowed"
          )}
          aria-label="Next month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {loading || !salary ? (
        <div className="bg-white rounded-2xl shadow-sm"><PetalSpinner /></div>
      ) : (
        <div className="space-y-3">
          {/* Total card */}
          <div className="bg-gradient-to-br from-brand to-brand-dark text-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 mb-2 opacity-80">
              <Banknote size={16} />
              <span className="text-xs uppercase tracking-wider font-semibold">Total</span>
            </div>
            <div className="text-3xl font-bold">Rp {formatIDR(salary.total)}</div>
            <div className="text-sm opacity-80 mt-1">
              {salary.sessionsWorked + salary.assistedCount === 0
                ? "No sessions this month yet"
                : `${salary.sessionsWorked} class${salary.sessionsWorked === 1 ? "" : "es"}${salary.assistedCount > 0 ? ` · ${salary.assistedCount} assisted` : ""}`}
            </div>
          </div>

          {/* Cash in my safe (safe feature; hidden while off for the studio).
              The number must match the bills in the trainer's physical box. */}
          {safe !== null && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-gray-500">
                  <Banknote size={16} className="text-brand" />
                  <span className="text-xs uppercase tracking-wider font-semibold">Cash in my safe</span>
                </div>
                <span className="text-xl font-bold text-gray-900">Rp {formatIDR(safe.balance)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Should match the cash in your safe box - tell the admin if it doesn&apos;t.
              </p>
              {safe.operations.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {safe.operations.slice(0, 5).map((o) => (
                    <div key={o.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500 truncate">
                        {o.kind === "salary" ? "Salary from safe" : o.kind === "withdrawal" ? "Taken by studio" : "Correction"}
                        {o.note ? ` - ${o.note}` : ""}
                        <span className="text-gray-300"> · {formatDate(parseISO(o.createdAt), "MMM d")}</span>
                      </span>
                      <span className={cn("font-semibold tabular-nums flex-shrink-0", o.amount < 0 ? "text-red-500" : "text-green-600")}>
                        {o.amount < 0 ? "-" : "+"}Rp {formatIDR(Math.abs(o.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Breakdown */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <Row
              icon={<TrendingUp size={16} className="text-gray-400" />}
              label={`Commission${salary.assistantCommission > 0 ? " (lead)" : ""}`}
              sub={`${salary.commissionRate}% of paid bookings - ${salary.assistantRate}% goes to the assistant when present`}
              value={`+ Rp ${formatIDR(salary.mainCommission)}`}
              hideSub={salary.mainCommission === 0}
            />
            {salary.assistantCommission > 0 && (
              <Row
                icon={<HandHelping size={16} className="text-gray-400" />}
                label="Assistant commission"
                sub={`${salary.assistantRate}% of paid bookings on sessions you assisted`}
                value={`+ Rp ${formatIDR(salary.assistantCommission)}`}
              />
            )}
            <Row
              icon={<Users size={16} className="text-gray-400" />}
              label="Paid bookings"
              value={`${salary.paidBookingsCount}`}
              isLast
            />
          </div>

          {/* Per-class breakdown — every paid class that built this total, so a
              trainer sees exactly what earned what (read-only). The rows sum to
              the Commission above. */}
          {salary.breakdown.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">Your classes this month</span>
                <span className="text-xs text-gray-400">{salary.breakdown.length} paid</span>
              </div>
              <div className="divide-y divide-gray-100">
                {salary.breakdown.map((r) => (
                  <div key={r.bookingId} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800 truncate">{r.client}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {formatDate(parseISO(r.date), "MMM d")} · {r.startTime} · {classTypeLabel(r.classType)}
                        {r.role === "assistant" && " · assisted"}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">+ {fmtFull(r.commission)}</div>
                      <div className="text-[11px] text-gray-400 whitespace-nowrap">
                        {r.rate}% of {fmtFull(r.amount)}
                        {r.tier && r.tier !== "FULL" ? ` (${PRICE_TIER_LABEL[r.tier] ?? r.tier})` : ""} · {paymentTypeLabel(r.paymentType)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-100">
                <span className="text-sm font-semibold text-gray-700">Total commission</span>
                <span className="text-sm font-bold text-gray-900">{fmtFull(salary.commission)}</span>
              </div>
            </div>
          )}

          {/* Note */}
          <div className="text-xs text-gray-400 px-2">
            You earn {salary.commissionRate}% of paid bookings on your sessions - there is no fixed base
            salary, your pay is the commission on the classes above. When a session has an assistant
            trainer, {salary.assistantRate}% of that goes to the assistant and the rest to you.
          </div>
        </div>
      )}
    </div>
  )
}

function Row({
  icon, label, sub, value, hideSub, isLast,
}: {
  icon: React.ReactNode
  label: string
  sub?: string
  value: string
  hideSub?: boolean
  isLast?: boolean
}) {
  return (
    <div className={cn("flex items-start gap-3 px-5 py-4", !isLast && "border-b border-gray-100")}>
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-800">{label}</div>
        {sub && !hideSub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
      <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">{value}</div>
    </div>
  )
}
