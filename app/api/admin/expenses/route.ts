import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const ExpenseSchema = z.object({
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().optional(),
  date: z.string(),
})

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get("month")

  const expenses = await prisma.expense.findMany({
    where: {
      studioId: ctx.studioId,
      ...(month ? { date: { startsWith: month } } : {}),
    },
    orderBy: { date: "desc" },
  })

  return NextResponse.json(expenses)
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const data = ExpenseSchema.parse(body)
    const expense = await prisma.expense.create({ data: { ...data, studioId: ctx.studioId } })
    return NextResponse.json(expense, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  const result = await prisma.expense.deleteMany({ where: { id, studioId: ctx.studioId } })
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true })
}
