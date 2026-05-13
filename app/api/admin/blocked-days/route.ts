import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

export async function GET(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const days = await prisma.blockedDay.findMany({
    where: from && to ? { date: { gte: from, lte: to } } : {},
    orderBy: { date: "asc" },
  })

  return NextResponse.json(days)
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { date, reason } = await request.json()
  if (!date) return NextResponse.json({ error: "Date required" }, { status: 400 })

  const day = await prisma.blockedDay.upsert({
    where: { date },
    update: { reason: reason ?? null },
    create: { date, reason: reason ?? null },
  })

  return NextResponse.json(day, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")
  if (!date) return NextResponse.json({ error: "Date required" }, { status: 400 })

  await prisma.blockedDay.deleteMany({ where: { date } })
  return NextResponse.json({ success: true })
}
