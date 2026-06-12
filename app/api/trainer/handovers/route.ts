import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { baliDateStr } from "@/lib/tz"
import { elog } from "@/lib/elog"
import { sendPush } from "@/lib/expo-push"

export const dynamic = "force-dynamic"

// Trainer-to-trainer class handover, GIVE-initiated only: the slot's owner
// offers ONE specific colleague; nobody can "claim" someone else's class.
// One PENDING request per slot at a time keeps the state machine boring.

const CreateSchema = z.object({
  slotId: z.string(),
  toTrainerId: z.string(),
  note: z.string().max(300).optional(),
})

async function me(ctx: { userId: string; studioId: string }) {
  return prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
    select: { id: true, name: true },
  })
}

// GET → { incoming, outgoing } for the bell.
export async function GET() {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const trainer = await me(ctx)
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  // Lazily expire requests whose class has already started — accepting a
  // class that's over makes no sense and would corrupt salary history.
  const today = baliDateStr(new Date())
  const stale = await prisma.slotHandover.findMany({
    where: { studioId: ctx.studioId, status: "PENDING" },
    select: { id: true, slotId: true },
  })
  if (stale.length) {
    const slots = await prisma.timeSlot.findMany({
      where: { id: { in: stale.map((h) => h.slotId) } },
      select: { id: true, date: true },
    })
    const past = new Set(slots.filter((s) => s.date < today).map((s) => s.id))
    const expiredIds = stale.filter((h) => past.has(h.slotId)).map((h) => h.id)
    if (expiredIds.length) {
      await prisma.slotHandover.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: "EXPIRED", resolvedAt: new Date() },
      })
    }
  }

  const [incoming, outgoing] = await Promise.all([
    prisma.slotHandover.findMany({
      where: { toTrainerId: trainer.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.slotHandover.findMany({
      where: { fromTrainerId: trainer.id, status: { in: ["PENDING", "ACCEPTED", "DECLINED"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ])

  // Hydrate slot + names in two bounded queries.
  const slotIds = [...new Set([...incoming, ...outgoing].map((h) => h.slotId))]
  const trainerIds = [...new Set([...incoming, ...outgoing].flatMap((h) => [h.fromTrainerId, h.toTrainerId]))]
  const [slots, trainers] = await Promise.all([
    prisma.timeSlot.findMany({
      where: { id: { in: slotIds } },
      select: { id: true, date: true, startTime: true, endTime: true, classType: true, maxCapacity: true,
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } } },
    }),
    prisma.trainer.findMany({ where: { id: { in: trainerIds } }, select: { id: true, name: true } }),
  ])
  const slotMap = new Map(slots.map((s) => [s.id, s]))
  const nameMap = new Map(trainers.map((t) => [t.id, t.name]))
  const shape = (h: (typeof incoming)[number]) => ({
    id: h.id,
    status: h.status,
    note: h.note,
    createdAt: h.createdAt,
    fromName: nameMap.get(h.fromTrainerId) ?? "?",
    toName: nameMap.get(h.toTrainerId) ?? "?",
    slot: slotMap.get(h.slotId) ?? null,
  })

  return NextResponse.json({ incoming: incoming.map(shape), outgoing: outgoing.map(shape) })
}

// POST → create a handover offer.
export async function POST(request: NextRequest) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const trainer = await me(ctx)
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const data = CreateSchema.parse(await request.json())

  const slot = await prisma.timeSlot.findFirst({
    where: { id: data.slotId, studioId: ctx.studioId },
  })
  if (!slot || slot.trainerId !== trainer.id) {
    return NextResponse.json({ error: "Not your class" }, { status: 403 })
  }
  if (slot.date < baliDateStr(new Date())) {
    return NextResponse.json({ error: "Class is in the past" }, { status: 400 })
  }
  const target = await prisma.trainer.findFirst({
    where: { id: data.toTrainerId, studioId: ctx.studioId, archived: false },
    select: { id: true, name: true, userId: true },
  })
  if (!target || target.id === trainer.id) {
    return NextResponse.json({ error: "Pick another trainer" }, { status: 400 })
  }
  const existing = await prisma.slotHandover.findFirst({
    where: { slotId: slot.id, status: "PENDING" },
  })
  if (existing) {
    return NextResponse.json({ error: "A handover for this class is already pending" }, { status: 409 })
  }

  const handover = await prisma.slotHandover.create({
    data: {
      slotId: slot.id,
      studioId: ctx.studioId,
      fromTrainerId: trainer.id,
      toTrainerId: target.id,
      note: data.note?.trim() || null,
    },
  })

  void elog("handover", "offer created", {
    handoverId: handover.id, slotId: slot.id, from: trainer.name, to: target.name,
    classTime: `${slot.date} ${slot.startTime}`,
  })
  // Best-effort push to the colleague's phone (bell badge covers the web).
  try {
    await sendPush({
      userId: target.userId,
      title: "Class handover request",
      body: `${trainer.name} asks you to take the ${slot.startTime} class on ${slot.date}.`,
      data: { type: "handover", handoverId: handover.id },
    })
  } catch { /* best-effort */ }

  return NextResponse.json(handover, { status: 201 })
}
