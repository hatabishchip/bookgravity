import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const days = await prisma.blockedDay.findMany({
    where: {
      studioId: ctx.studioId,
      ...(from && to ? { date: { gte: from, lte: to } } : {}),
    },
    orderBy: { date: "asc" },
  })

  return NextResponse.json(days)
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { date, reason } = await request.json()
  if (!date) return NextResponse.json({ error: "Date required" }, { status: 400 })

  const day = await prisma.blockedDay.upsert({
    where: { studioId_date: { studioId: ctx.studioId, date } },
    update: { reason: reason ?? null },
    create: { date, reason: reason ?? null, studioId: ctx.studioId },
  })

  return NextResponse.json(day, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")
  if (!date) return NextResponse.json({ error: "Date required" }, { status: 400 })

  await prisma.blockedDay.deleteMany({ where: { date, studioId: ctx.studioId } })
  return NextResponse.json({ success: true })
}
