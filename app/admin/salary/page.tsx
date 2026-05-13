"use client"

import { useState, useEffect, useCallback } from "react"
import { format, addMonths, subMonths } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, Trash2, X, TrendingUp, Wallet, CreditCard, Receipt, DollarSign } from "lucide-react"
import { cn } from "@/lib/utils"

type Payment = { id: string; amount: number; note: string | null; createdAt: string }
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
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("p-2 rounded-xl", colors[color])}>
          <Icon size={18} />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function SalaryPage() {
  const [monthDate, setMonthDate] = useState(new Date())
  const month = format(monthDate, "yyyy-MM")

  const [trainers, setTrainers] = useState<TrainerSalary[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  // Payment modal
  const [payModal, setPayModal] = useState<TrainerSalary | null>(null)
  const [payAmount, setPayAmount] = useState("")
  const [payNote, setPayNote] = useState("")
  const [paying, setPaying] = useState(false)

  // Expense modal
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

  // Summary numbers
  const totalRevenue = trainers.reduce((s, t) => s + t.revenue, 0)
  const totalAccrued = trainers.reduce((s, t) => s + t.accrued, 0)
  const totalPaid = trainers.reduce((s, t) => s + t.paid, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const netProfit = totalRevenue - totalAccrued - totalExpenses

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salary & Expenses</h1>
          <p className="text-gray-500 text-sm mt-1">{format(monthDate, "MMMM yyyy")}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMonthDate(subMonths(monthDate, 1))} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setMonthDate(new Date())}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            This month
          </button>
          <button onClick={() => setMonthDate(addMonths(monthDate, 1))} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <SummaryCard icon={TrendingUp} label="Revenue" value={formatIDR(totalRevenue)} sub="From paid bookings" color="green" />
        <SummaryCard icon={Wallet} label="Salaries accrued" value={formatIDR(totalAccrued)} sub={`${trainers.length} trainer(s)`} color="blue" />
        <SummaryCard icon={CreditCard} label="Salaries paid" value={formatIDR(totalPaid)} sub={`Balance: ${formatIDR(totalAccrued - totalPaid)}`} color="amber" />
        <SummaryCard icon={Receipt} label="Expenses" value={formatIDR(totalExpenses)} sub={`${expenses.length} item(s)`} color="red" />
        <SummaryCard
          icon={DollarSign}
          label="Net profit"
          value={formatIDR(netProfit)}
          sub="Revenue − salaries − expenses"
          color={netProfit >= 0 ? "green" : "red"}
        />
      </div>

      {/* Trainers salary table */}
      <div className="bg-white rounded-2xl shadow-sm mb-6 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Trainer Salaries</h2>
          <span className="text-xs text-gray-400">{format(monthDate, "MMMM yyyy")}</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
        ) : trainers.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No trainers found.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {trainers.map((t) => (
              <div key={t.id} className="px-6 py-4">
                <div className="grid grid-cols-8 gap-4 items-center">
                  {/* Trainer */}
                  <div className="col-span-2">
                    <div className="font-medium text-gray-800">{t.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{t.commissionRate}% commission</div>
                  </div>
                  {/* Sessions */}
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-700">{t.sessions}</div>
                    <div className="text-[10px] text-gray-400">sessions</div>
                  </div>
                  {/* Revenue */}
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-700">{formatIDR(t.revenue)}</div>
                    <div className="text-[10px] text-gray-400">revenue</div>
                  </div>
                  {/* Accrued */}
                  <div className="text-center">
                    <div className="text-sm font-semibold text-[#2C6E49]">{formatIDR(t.accrued)}</div>
                    <div className="text-[10px] text-gray-400">base + {formatIDR(t.commission)} comm.</div>
                  </div>
                  {/* Paid */}
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-700">{formatIDR(t.paid)}</div>
                    <div className="text-[10px] text-gray-400">paid out</div>
                  </div>
                  {/* Balance */}
                  <div className="text-center">
                    <div className={cn(
                      "text-sm font-semibold",
                      t.balance > 0 ? "text-amber-600" : t.balance < 0 ? "text-red-500" : "text-gray-400"
                    )}>
                      {t.balance === 0 ? "Settled" : formatIDR(t.balance)}
                    </div>
                    <div className="text-[10px] text-gray-400">balance</div>
                  </div>
                  {/* Action */}
                  <div className="text-right">
                    <button
                      onClick={() => { setPayModal(t); setPayAmount(String(t.balance > 0 ? t.balance : "")) }}
                      disabled={t.balance <= 0}
                      className="px-3 py-1.5 bg-[#2C6E49] text-white text-xs rounded-lg hover:bg-[#1E4D34] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Pay out
                    </button>
                  </div>
                </div>

                {/* Payment history */}
                {t.payments.length > 0 && (
                  <div className="mt-3 ml-0 flex flex-wrap gap-2">
                    {t.payments.map((p) => (
                      <div key={p.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs">
                        <span className="text-[#2C6E49] font-medium">{formatIDR(p.amount)}</span>
                        {p.note && <span className="text-gray-400">· {p.note}</span>}
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400">{format(new Date(p.createdAt), "d MMM")}</span>
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expenses */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Expenses</h2>
            <p className="text-xs text-gray-400 mt-0.5">Total: {formatIDR(totalExpenses)}</p>
          </div>
          <button
            onClick={() => setShowExpenseForm(true)}
            className="flex items-center gap-1.5 bg-[#2C6E49] text-white px-3 py-2 rounded-xl text-sm font-medium hover:bg-[#1E4D34] transition-colors"
          >
            <Plus size={14} />
            Add Expense
          </button>
        </div>

        {expenses.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No expenses recorded for {format(monthDate, "MMMM yyyy")}.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {expenses.map((exp) => (
              <div key={exp.id} className="px-6 py-3 flex items-center gap-4">
                <div className="w-24 text-xs text-gray-400 flex-shrink-0">
                  {format(new Date(exp.date + "T00:00:00"), "MMM d")}
                </div>
                <div className="w-24">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{exp.category}</span>
                </div>
                <div className="flex-1 text-sm text-gray-700">{exp.description || "—"}</div>
                <div className="font-semibold text-gray-800 text-sm">{formatIDR(exp.amount)}</div>
                <button
                  onClick={() => handleDeleteExpense(exp.id)}
                  disabled={deletingExp === exp.id}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pay out modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Pay Out</h2>
                <p className="text-sm text-gray-400 mt-0.5">{payModal.name} · {format(monthDate, "MMMM yyyy")}</p>
              </div>
              <button onClick={() => setPayModal(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Base salary</span>
                <span className="font-medium">{formatIDR(payModal.baseSalary)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Commission ({payModal.commissionRate}%)</span>
                <span className="font-medium">+{formatIDR(payModal.commission)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Already paid</span>
                <span className="font-medium text-green-600">−{formatIDR(payModal.paid)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1">
                <span className="font-medium text-gray-700">Balance due</span>
                <span className="font-bold text-[#2C6E49]">{formatIDR(payModal.balance)}</span>
              </div>
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
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  placeholder="e.g. Cash, transfer #123"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPayModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={paying} className="flex-1 bg-[#2C6E49] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60">
                  {paying ? "Saving..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add expense modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
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
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
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
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={expForm.category}
                  onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
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
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  placeholder="e.g. Monthly studio rent"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowExpenseForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={savingExp} className="flex-1 bg-[#2C6E49] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60">
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
