import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const CLASS_DURATION_MIN = 120
const MIN_GAP_MIN = 0
const MAX_SLOTS_PER_DAY = 7

function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function minToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

const trainerSelect = { id: true, name: true, color: true }
const slotInclude = {
  trainer: { select: trainerSelect },
  assistant: { select: trainerSelect },
  _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
}

const SlotSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  trainerId: z.string().optional(),
  assistantId: z.string().nullable().optional(),
  maxCapacity: z.number().min(1).max(6).default(6),
  price: z.number().min(0).default(0),
})

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

  const slots = await prisma.timeSlot.findMany({
    where: from && to ? { date: { gte: from, lte: to } } : {},
    include: slotInclude,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })

  return NextResponse.json(slots)
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const data = SlotSchema.parse(body)

    const startMin = timeToMin(data.startTime)
    const endMin = startMin + CLASS_DURATION_MIN
    const endTime = minToTime(endMin)

    const existingSlots = await prisma.timeSlot.findMany({ where: { date: data.date } })

    // Max 7 sessions per day
    if (existingSlots.length >= MAX_SLOTS_PER_DAY) {
      return NextResponse.json(
        { error: `Maximum ${MAX_SLOTS_PER_DAY} sessions per day reached.` },
        { status: 409 }
      )
    }

    // Gap check
    for (const slot of existingSlots) {
      const exStart = timeToMin(slot.startTime)
      const exEnd = timeToMin(slot.endTime)
      if (startMin < exEnd + MIN_GAP_MIN && exStart < endMin + MIN_GAP_MIN) {
        return NextResponse.json(
          { error: `Conflicts with session at ${slot.startTime}–${slot.endTime}. Min 30-min gap required.` },
          { status: 409 }
        )
      }
    }

    // Check if day is blocked
    const blocked = await prisma.blockedDay.findUnique({ where: { date: data.date } })
    if (blocked) {
      return NextResponse.json(
        { error: `${data.date} is blocked${blocked.reason ? ": " + blocked.reason : ""}. Unblock the day first.` },
        { status: 409 }
      )
    }

    const slot = await prisma.timeSlot.create({
      data: { ...data, endTime },
      include: slotInclude,
    })

    return NextResponse.json(slot, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  try {
    const body = await request.json()
    const data = z.object({
      startTime: z.string(),
      trainerId: z.string().nullable().optional(),
      assistantId: z.string().nullable().optional(),
      maxCapacity: z.number().min(1).max(6),
      price: z.number().min(0),
    }).parse(body)

    const startMin = timeToMin(data.startTime)
    const endMin = startMin + CLASS_DURATION_MIN
    const endTime = minToTime(endMin)

    const current = await prisma.timeSlot.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const siblings = await prisma.timeSlot.findMany({
      where: { date: current.date, NOT: { id } },
    })
    for (const slot of siblings) {
      const exStart = timeToMin(slot.startTime)
      const exEnd = timeToMin(slot.endTime)
      if (startMin < exEnd + MIN_GAP_MIN && exStart < endMin + MIN_GAP_MIN) {
        return NextResponse.json(
          { error: `Conflicts with session at ${slot.startTime}–${slot.endTime}. Min 30-min gap required.` },
          { status: 409 }
        )
      }
    }

    const updated = await prisma.timeSlot.update({
      where: { id },
      data: {
        startTime: data.startTime, endTime,
        trainerId: data.trainerId ?? null,
        assistantId: data.assistantId ?? null,
        maxCapacity: data.maxCapacity,
        price: data.price,
      },
      include: slotInclude,
    })
    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  await prisma.timeSlot.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
