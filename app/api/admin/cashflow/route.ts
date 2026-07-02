import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { priceForTier } from "@/lib/payments"
import { studioDateStr } from "@/lib/tz"

// Cash-flow report = the studio's daily money ledger, auto-built from data the
// app already holds, mirroring the owner's "2026 Cash flow" sheet:
//   MONEY IN  - per-class payments (Cash/EDC/QR/Transfer) + membership sales.
//               (A booking paid by MEMBERSHIP is NOT income here - that cash
//               was already counted when the pass was sold.)
//   MONEY OUT - manual expenses + trainer salary payouts.
// QR maps to the sheet's "QRIS" column.

const CASH_METHODS = ["CASH", "EDC", "QR", "TRANSFER"] as const
type Method = (typeof CASH_METHODS)[number]

type IncomeRow = {
  id: string
  date: string
  label: string
  responsible: string
  method: Method
  amount: number
  kind: "class" | "membership" | "service"
}
type ExpenseRow = {
  id: string
  date: string
  description: string
  amount: number
  kind: "expense" | "payout"
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7)
  const [year, mon] = month.split("-").map(Number)
  const monthStart = `${month}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { localPrice: true, membershipClassPrice: true },
  })
  const localPrice = studio?.localPrice ?? 200000
  const fallbackClassPrice = studio?.membershipClassPrice ?? 250000

  const isCashMethod = (t: string): t is Method => (CASH_METHODS as readonly string[]).includes(t)

  // ---- MONEY IN: per-class payments (real cash, not membership-paid) ----
  const paidBookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      paymentStatus: "PAID",
      slot: { studioId: ctx.studioId, date: { gte: monthStart, lte: monthEnd } },
    },
    include: { slot: { select: { date: true, price: true, trainer: { select: { name: true } } } } },
  })

  const income: IncomeRow[] = []
  for (const b of paidBookings) {
    if (!isCashMethod(b.paymentType)) continue // MEMBERSHIP / PENDING -> not cash in
    income.push({
      id: b.id,
      date: b.slot.date,
      label: b.clientName,
      responsible: b.slot.trainer?.name ?? "",
      method: b.paymentType,
      amount: priceForTier(b, { slotPrice: b.slot.price, memberPrice: fallbackClassPrice, localPrice }),
      kind: "class",
    })
  }

  // ---- MONEY IN: membership (pass) sales ----
  // Bucket by BALI-local month: createdAt is an instant, so a pass sold on the
  // 1st at 07:00 Bali (= 23:00 UTC on the last of the previous month) must land
  // in THIS month, matching how the class rows (Bali date strings) bucket.
  const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`
  const monthStartInstant = new Date(`${monthStart}T00:00:00+08:00`)
  const monthEndExclusive = new Date(`${nextMonth}-01T00:00:00+08:00`)
  const memberships = await prisma.membership.findMany({
    where: { studioId: ctx.studioId, createdAt: { gte: monthStartInstant, lt: monthEndExclusive } },
  })
  for (const m of memberships) {
    if (!isCashMethod(m.paymentType)) continue
    income.push({
      id: m.id,
      date: studioDateStr(m.createdAt),
      label: `${m.clientName ?? "Membership"} (${m.totalClasses}-class pass)`,
      responsible: m.soldByName ?? "",
      method: m.paymentType,
      amount: (m.classPrice ?? fallbackClassPrice) * m.totalClasses,
      kind: "membership",
    })
  }

  // ---- MONEY IN: additional services (mat/water/etc.) paid separately ----
  // Only services with an explicit cash paymentType count here; a null one means
  // "paid together with the class" and is already inside the class amount.
  const svcRows = await prisma.bookingService.findMany({
    where: {
      booking: {
        status: "CONFIRMED",
        slot: { studioId: ctx.studioId, date: { gte: monthStart, lte: monthEnd } },
      },
    },
    include: {
      service: { select: { name: true, price: true } },
      booking: {
        select: { clientName: true, slot: { select: { date: true, trainer: { select: { name: true } } } } },
      },
    },
  })
  for (const s of svcRows) {
    if (!s.paymentType || !isCashMethod(s.paymentType)) continue
    income.push({
      id: `svc-${s.id}`,
      date: s.booking.slot.date,
      label: `${s.booking.clientName} - ${s.service.name}`,
      responsible: s.booking.slot.trainer?.name ?? "",
      method: s.paymentType,
      amount: s.service.price,
      kind: "service",
    })
  }

  income.sort((a, b) => a.date.localeCompare(b.date))

  const incomeTotals: Record<Method, number> & { total: number } = { CASH: 0, EDC: 0, QR: 0, TRANSFER: 0, total: 0 }
  for (const r of income) {
    incomeTotals[r.method] += r.amount
    incomeTotals.total += r.amount
  }

  // ---- MONEY OUT: manual expenses + salary payouts ----
  const [expenses, payouts] = await Promise.all([
    prisma.expense.findMany({ where: { studioId: ctx.studioId, date: { startsWith: month } }, orderBy: { date: "asc" } }),
    prisma.trainerPayment.findMany({
      where: { studioId: ctx.studioId, month, kind: { not: "accrual" } },
      include: { trainer: { select: { name: true } } },
    }),
  ])

  const expenseRows: ExpenseRow[] = []
  for (const e of expenses) {
    expenseRows.push({ id: e.id, date: e.date, description: e.description ? `${e.category} - ${e.description}` : e.category, amount: e.amount, kind: "expense" })
  }
  for (const p of payouts) {
    expenseRows.push({ id: p.id, date: studioDateStr(p.createdAt), description: `Salary payout - ${p.trainer?.name ?? "trainer"}`, amount: p.amount, kind: "payout" })
  }
  expenseRows.sort((a, b) => a.date.localeCompare(b.date))
  const expenseTotal = expenseRows.reduce((s, r) => s + r.amount, 0)

  return NextResponse.json({
    month,
    monthLabel: new Date(year, mon - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }),
    income,
    incomeTotals,
    expenseRows,
    expenseTotal,
    net: incomeTotals.total - expenseTotal,
  })
}
