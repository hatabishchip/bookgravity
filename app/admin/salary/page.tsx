"use client"

import { useState, useEffect, useCallback } from "react"
import { format, addMonths, subMonths } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, Trash2, X, TrendingUp, Wallet, CreditCard, Receipt, DollarSign, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { paymentTypeLabel, classTypeLabel, PRICE_TIER_LABEL } from "@/lib/payments"

type Payment = { id: string; amount: number; note: string | null; createdAt: string; kind?: string }
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
type TrainerSalary = {
  id: string
  name: string
  email: string
  commissionRate: number
  sessions: number
  paidBookings: number
  revenue: number
  commission: number
  baseSalary: number
  accrued: number
  paid: number
  balance: number
  payments: Payment[]
  breakdown: BreakdownRow[]
}

type Expense = {
  id: string
  amount: number
  category: string
  description: string | null
  date: string
}

const EXPENSE_CATEGORIES = ["Rent", "Utilities", "Equipment", "Marketing", "Staff", "Supplies", "Other"]

function formatIDR(n: number) {
  return "Rp " + n.toLocaleString("id-ID")
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "gray",
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color?: "green" | "red" | "blue" | "gray" | "amber"
}) {
  const colors = {
    green: "bg-green-50 text-green-600",
    red: "bg-red-50 text-red-500",
    blue: "bg-blue-50 text-blue-600",
    gray: "bg-gray-100 text-gray-500",
    amber: "bg-amber-50 text-amber-600",
  }
  return (
    <div className="bg-white rounded-2xl p-4 lg:p-5 shadow-sm">
      <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-3">
        <div className={cn("p-1.5 lg:p-2 rounded-xl", colors[color])}>
          <Icon size={16} />
        </div>
        <span className="text-xs lg:text-sm text-gray-500 truncate">{label}</span>
      </div>
      <div className="text-base lg:text-xl font-bold text-gray-900 break-words">{value}</div>
      {sub && <div className="text-[10px] lg:text-xs text-gray-400 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

export default function SalaryPage() {
  const [monthDate, setMonthDate] = useState(new Date())
  const month = format(monthDate, "yyyy-MM")

  const [trainers, setTrainers] = useState<TrainerSalary[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [payModal, setPayModal] = useState<TrainerSalary | null>(null)
  const [payAmount, setPayAmount] = useState("")
  const [payNote, setPayNote] = useState("")
  const [paying, setPaying] = useState(false)

  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [expForm, setExpForm] = useState({
    amount: "",
    category: "Rent",
    description: "",
    date: format(new Date(), "yyyy-MM-dd"),
  })
  const [savingExp, setSavingExp] = useState(false)
  const [deletingExp, setDeletingExp] = useState<string | null>(null)
  const [deletingPay, setDeletingPay] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [salRes, expRes] = await Promise.all([
      fetch(`/api/admin/salary?month=${month}`),
      fetch(`/api/admin/expenses?month=${month}`),
    ])
    setTrainers(await salRes.json())
    setExpenses(await expRes.json())
    setLoading(false)
  }, [month])

  useEffect(() => { fetchData() }, [fetchData])

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!payModal) return
    setPaying(true)
    await fetch("/api/admin/salary/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trainerId: payModal.id,
        amount: Number(payAmount),
        month,
        note: payNote || undefined,
      }),
    })
    await fetchData()
    setPayModal(null)
    setPayAmount("")
    setPayNote("")
    setPaying(false)
  }

  const handleDeletePayment = async (id: string) => {
    if (!confirm("Delete this payment record?")) return
    setDeletingPay(id)
    await fetch(`/api/admin/salary/payments?id=${id}`, { method: "DELETE" })
    await fetchData()
    setDeletingPay(null)
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingExp(true)
    await fetch("/api/admin/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(expForm.amount),
        category: expForm.category,
        description: expForm.description || undefined,
        date: expForm.date,
      }),
    })
    await fetchData()
    setShowExpenseForm(false)
    setExpForm({ amount: "", category: "Rent", description: "", date: format(new Date(), "yyyy-MM-dd") })
    setSavingExp(false)
  }

  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Delete this expense?")) return
    setDeletingExp(id)
    await fetch(`/api/admin/expenses?id=${id}`, { method: "DELETE" })
    await fetchData()
    setDeletingExp(null)
  }

  const totalRevenue = trainers.reduce((s, t) => s + t.revenue, 0)
  const totalAccrued = trainers.reduce((s, t) => s + t.accrued, 0)
  const totalPaid = trainers.reduce((s, t) => s + t.paid, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const netProfit = totalRevenue - totalAccrued - totalExpenses

  return (
    <div>
      {/* Header */}
      <div className="mb-6 space-y-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Salary &amp; Expenses</h1>
          <p className="text-gray-500 text-xs lg:text-sm mt-1">{format(monthDate, "MMMM yyyy")}</p>
        </div>
        {/* Month navigation */}
        <div className="flex items-stretch gap-2">
          <button
            onClick={() => setMonthDate(subMonths(monthDate, 1))}
            aria-label="Previous month"
            className="flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">Previous</span>
          </button>
          <button
            onClick={() => setMonthDate(new Date())}
            className="flex-1 lg:flex-initial px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            This month
          </button>
          <button
            onClick={() => setMonthDate(addMonths(monthDate, 1))}
            aria-label="Next month"
            className="flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Summary cards: 2 on mobile, 5 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 mb-8">
        <SummaryCard icon={TrendingUp} label="Revenue" value={formatIDR(totalRevenue)} sub="From paid bookings" color="green" />
        <SummaryCard icon={Wallet} label="Salaries accrued" value={formatIDR(totalAccrued)} sub={`${trainers.length} trainer(s)`} color="blue" />
        <SummaryCard icon={CreditCard} label="Salaries paid" value={formatIDR(totalPaid)} sub={`Balance: ${formatIDR(totalAccrued - totalPaid)}`} color="amber" />
        <SummaryCard icon={Receipt} label="Expenses" value={formatIDR(totalExpenses)} sub={`${expenses.length} item(s)`} color="red" />
        <SummaryCard
          icon={DollarSign}
          label="Net profit"
          value={formatIDR(netProfit)}
          sub="Rev - salaries - exp"
          color={netProfit >= 0 ? "green" : "red"}
        />
      </div>

      {/* Trainer salaries — card layout */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="font-semibold text-gray-800 text-base lg:text-lg">Trainer Salaries</h2>
          <span className="text-xs text-gray-400">{format(monthDate, "MMMM yyyy")}</span>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm"><PetalSpinner /></div>
        ) : trainers.length === 0 ? (
          <div className="bg-white rounded-2xl py-12 text-center text-gray-400 text-sm shadow-sm">No trainers found.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
            {trainers.map((t) => (
              <div key={t.id} className="bg-white rounded-2xl p-4 lg:p-5 shadow-sm">
                {/* Trainer header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{t.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{t.commissionRate}% commission · {t.sessions} sessions</div>
                  </div>
                  <button
                    onClick={() => { setPayModal(t); setPayAmount(String(t.balance > 0 ? t.balance : "")) }}
                    disabled={t.balance <= 0}
                    className="px-3 py-2 bg-brand text-white text-xs font-medium rounded-lg hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    Pay out
                  </button>
                </div>

                {/* Stats grid 2x2 */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Stat label="Revenue" value={formatIDR(t.revenue)} />
                  <Stat label="Accrued" value={formatIDR(t.accrued)} accent="brand" hint={`+${formatIDR(t.commission)} comm.`} />
                  <Stat label="Paid out" value={formatIDR(t.paid)} />
                  <Stat
                    label="Balance"
                    value={t.balance === 0 ? "Settled" : formatIDR(t.balance)}
                    accent={t.balance > 0 ? "amber" : t.balance < 0 ? "red" : "muted"}
                  />
                </div>

                {/* Payment history */}
                {t.payments.length > 0 && (
                  <div className="pt-3 border-t border-gray-100">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">Payments this month</div>
                    <div className="flex flex-wrap gap-1.5">
                      {t.payments.map((p) => (
                        <div key={p.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs">
                          {p.kind === "accrual" ? (
                            <span className="text-amber-600 font-medium">+{formatIDR(p.amount)} accrued</span>
                          ) : (
                            <span className="text-brand font-medium">{formatIDR(p.amount)} paid</span>
                          )}
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400">{format(new Date(p.createdAt), "d MMM")}</span>
                          {p.note && <span className="text-gray-400 truncate max-w-[120px]" title={p.note}>· {p.note}</span>}
                          <button
                            onClick={() => handleDeletePayment(p.id)}
                            disabled={deletingPay === p.id}
                            className="ml-0.5 text-gray-300 hover:text-red-400 transition-colors"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-class breakdown — audit each class that built the
                    commission (Sveta's "Employee commissions" sheet): client,
                    amount, payment method, %. Rows sum to "comm." above. */}
                {t.breakdown.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setExpandedIds((prev) => {
                        const n = new Set(prev)
                        n.has(t.id) ? n.delete(t.id) : n.add(t.id)
                        return n
                      })}
                      className="w-full flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-400 hover:text-gray-600"
                    >
                      <span>Commission breakdown · {t.breakdown.length} classes</span>
                      <ChevronDown size={14} className={cn("transition-transform", expandedIds.has(t.id) && "rotate-180")} />
                    </button>
                    {expandedIds.has(t.id) && (
                      <div className="mt-2 border border-gray-100 rounded-lg overflow-hidden">
                        {t.breakdown.map((r) => (
                          <div key={r.bookingId} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-b-0 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="text-gray-800 truncate">{r.client}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {format(new Date(r.date), "MMM d")} · {r.startTime} · {classTypeLabel(r.classType)}
                                {r.role === "assistant" && " · assisted"}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="font-semibold text-gray-900 whitespace-nowrap">+{formatIDR(r.commission)}</div>
                              <div className="text-[10px] text-gray-400 whitespace-nowrap">{r.rate}% of {formatIDR(r.amount)}{r.tier && r.tier !== "FULL" ? ` (${PRICE_TIER_LABEL[r.tier] ?? r.tier})` : ""} · {paymentTypeLabel(r.paymentType)}</div>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-xs">
                          <span className="font-semibold text-gray-600">Total commission</span>
                          <span className="font-bold text-gray-900">{formatIDR(t.commission)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expenses */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1 gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-800 text-base lg:text-lg">Expenses</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">Total: {formatIDR(totalExpenses)}</p>
          </div>
          <button
            onClick={() => setShowExpenseForm(true)}
            className="flex items-center gap-1.5 bg-brand text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-brand-dark transition-colors flex-shrink-0"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Add Expense</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>

        {expenses.length === 0 ? (
          <div className="bg-white rounded-2xl py-10 text-center text-gray-400 text-sm shadow-sm">
            No expenses recorded for {format(monthDate, "MMMM yyyy")}.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {expenses.map((exp) => (
              <div key={exp.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{exp.category}</span>
                    <span className="text-xs text-gray-400">{format(new Date(exp.date + "T00:00:00"), "d MMM yyyy")}</span>
                  </div>
                  <div className="text-sm text-gray-700 mt-1">{exp.description || "-"}</div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="font-semibold text-gray-900">{formatIDR(exp.amount)}</div>
                  <button
                    onClick={() => handleDeleteExpense(exp.id)}
                    disabled={deletingExp === exp.id}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pay out modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-800">Pay Out</h2>
                <p className="text-sm text-gray-400 mt-0.5 truncate">{payModal.name} · {format(monthDate, "MMM yyyy")}</p>
              </div>
              <button onClick={() => setPayModal(null)} className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0">
                <X size={18} />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 text-sm space-y-1.5">
              <div className="flex justify-between gap-3"><span className="text-gray-500">Commission ({payModal.commissionRate}%)</span><span className="font-medium">+{formatIDR(payModal.commission)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-gray-500">Already paid</span><span className="font-medium text-green-600">−{formatIDR(payModal.paid)}</span></div>
              <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5 mt-1"><span className="font-medium text-gray-700">Balance due</span><span className="font-bold text-brand">{formatIDR(payModal.balance)}</span></div>
            </div>

            <form onSubmit={handlePay} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (IDR)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1000"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder="e.g. Cash, transfer #123"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPayModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={paying} className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-medium hover:bg-brand-dark disabled:opacity-60">
                  {paying ? "Saving..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add expense modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-sm shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Add Expense</h2>
              <button onClick={() => setShowExpenseForm(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (IDR)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1000"
                    value={expForm.amount}
                    onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={expForm.date}
                    onChange={(e) => { setExpForm({ ...expForm, date: e.target.value }); (e.target as HTMLInputElement).blur() }}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={expForm.category}
                  onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={expForm.description}
                  onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  placeholder="e.g. Monthly studio rent"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowExpenseForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={savingExp} className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-medium hover:bg-brand-dark disabled:opacity-60">
                  {savingExp ? "Saving..." : "Add Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  accent = "default",
}: {
  label: string
  value: string
  hint?: string
  accent?: "default" | "brand" | "amber" | "red" | "muted"
}) {
  const colors = {
    default: "text-gray-800",
    brand: "text-brand",
    amber: "text-amber-600",
    red: "text-red-500",
    muted: "text-gray-400",
  }
  return (
    <div className="bg-gray-50 rounded-xl p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{label}</div>
      <div className={cn("text-sm font-semibold break-words", colors[accent])}>{value}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={hint}>{hint}</div>}
    </div>
  )
}
