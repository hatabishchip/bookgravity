import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import bcrypt from "bcryptjs"

const TrainerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
})

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainers = await prisma.trainer.findMany({
    where: { studioId: ctx.studioId },
    include: { user: { select: { email: true } } },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(trainers)
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const data = TrainerSchema.parse(body)

    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 })
    }

    const hashed = await bcrypt.hash(data.password, 10)

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashed,
        role: "TRAINER",
        studioId: ctx.studioId,
        trainer: { create: { name: data.name, studioId: ctx.studioId } },
      },
      include: { trainer: true },
    })

    return NextResponse.json(user.trainer, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  const body = await request.json()
  const updateData: Record<string, unknown> = {}

  if (body.commissionRate !== undefined) {
    const rate = Number(body.commissionRate)
    if (![15, 20].includes(rate)) {
      return NextResponse.json({ error: "Commission rate must be 15 or 20" }, { status: 400 })
    }
    updateData.commissionRate = rate
  }

  if (body.color !== undefined) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(body.color)) {
      return NextResponse.json({ error: "Invalid color format" }, { status: 400 })
    }
    updateData.color = body.color
  }

  if (body.whatsapp !== undefined) {
    updateData.whatsapp = String(body.whatsapp)
  }

  const existing = await prisma.trainer.findFirst({ where: { id, studioId: ctx.studioId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const trainer = await prisma.trainer.update({
    where: { id: existing.id },
    data: updateData,
    include: { user: { select: { email: true } } },
  })
  return NextResponse.json(trainer)
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  const trainer = await prisma.trainer.findFirst({ where: { id, studioId: ctx.studioId } })
  if (!trainer) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Trainer relations: TrainerPayment cascades on delete; TimeSlot has the
  // trainer as either primary (trainerId) or assistant (assistantId) with NO
  // cascade — straight delete fails with an FK constraint. So we unassign
  // first, then delete trainer + user atomically. Existing slots become
  // "Unassigned" rather than disappearing.
  const [unassignedPrimary, unassignedAssistant] = await prisma.$transaction([
    prisma.timeSlot.updateMany({ where: { trainerId: trainer.id }, data: { trainerId: null } }),
    prisma.timeSlot.updateMany({ where: { assistantId: trainer.id }, data: { assistantId: null } }),
  ])
  // Now safe to delete: trainer first (cascades TrainerPayment), then user.
  await prisma.trainer.delete({ where: { id: trainer.id } })
  await prisma.user.delete({ where: { id: trainer.userId } })

  return NextResponse.json({
    success: true,
    unassignedSlots: unassignedPrimary.count + unassignedAssistant.count,
  })
}
