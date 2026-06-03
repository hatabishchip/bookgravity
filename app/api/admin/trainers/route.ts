import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"

const TrainerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  whatsapp: z.string().optional(),
})

// 4-digit starter password — shown once to the admin; the trainer changes it
// on first sign-in (which clears initialPassword → shows "changed").
function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainers = await prisma.trainer.findMany({
    where: { studioId: ctx.studioId },
    include: {
      user: {
        select: {
          email: true,
          initialPassword: true,
          // Most recent web sign-in + mobile device heartbeat → "last active".
          loginSessions: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
          pushTokens: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { name: "asc" },
  })

  // Whether the studio has WhatsApp connected — the UI greys out the WhatsApp
  // notification toggle (and the booking flow won't send) until it's on.
  const studioWhatsAppEnabled = await isStudioWhatsAppEnabled(ctx.studioId)

  // Flatten the last-activity timestamp and drop the raw session arrays.
  const rows = trainers.map((t) => {
    const web = t.user.loginSessions[0]?.lastSeenAt ?? null
    const mob = t.user.pushTokens[0]?.lastSeenAt ?? null
    const lastActiveAt = [web, mob]
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    return {
      ...t,
      lastActiveAt,
      studioWhatsAppEnabled,
      user: { email: t.user.email, initialPassword: t.user.initialPassword },
    }
  })

  return NextResponse.json(rows)
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const data = TrainerSchema.parse(body)

    const email = data.email.trim().toLowerCase()
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 })
    }

    const pin = generatePin()
    const hashed = await bcrypt.hash(pin, 10)

    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        role: "TRAINER",
        initialPassword: pin,
        studioId: ctx.studioId,
        trainer: { create: { name: data.name, whatsapp: data.whatsapp?.trim() || "", studioId: ctx.studioId, notifyWhatsapp: true } },
      },
      include: { trainer: true },
    })

    // Return the starter password once so the admin can share it.
    return NextResponse.json({ ...user.trainer, initialPassword: pin }, { status: 201 })
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

  if (body.notifyEmail !== undefined) {
    updateData.notifyEmail = !!body.notifyEmail
  }
  if (body.notifyWhatsapp !== undefined) {
    updateData.notifyWhatsapp = !!body.notifyWhatsapp
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (name.length < 2) {
      return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 })
    }
    updateData.name = name
  }

  const existing = await prisma.trainer.findFirst({ where: { id, studioId: ctx.studioId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Email lives on the linked User row, not on Trainer — update it via the
  // user relation so login still works after the change.
  let newEmail: string | undefined
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase()
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!ok) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 })
    }
    // Reject duplicates against any other user.
    const dup = await prisma.user.findFirst({ where: { email, NOT: { id: existing.userId } } })
    if (dup) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 })
    }
    newEmail = email
  }

  const trainer = await prisma.trainer.update({
    where: { id: existing.id },
    data: updateData,
    include: { user: { select: { email: true } } },
  })

  if (newEmail) {
    const u = await prisma.user.update({
      where: { id: existing.userId },
      data: { email: newEmail },
      select: { email: true },
    })
    return NextResponse.json({ ...trainer, user: u })
  }

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
