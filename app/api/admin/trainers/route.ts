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

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Default: active trainers only (schedule dropdowns must not offer an
  // archived trainer). The Trainers management page passes ?all=1 to also
  // get the archived section.
  const includeArchived = new URL(request.url).searchParams.get("all") === "1"
  const trainers = await prisma.trainer.findMany({
    where: { studioId: ctx.studioId, ...(includeArchived ? {} : { archived: false }) },
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
      kind: "TRAINER" as const,
      ...t,
      lastActiveAt,
      studioWhatsAppEnabled,
      user: { email: t.user.email, initialPassword: t.user.initialPassword },
    }
  })

  // STAFF users (cleaning/support) live on the User row with no Trainer record,
  // so the Trainers page lists them alongside trainers with a "Staff" tag. They
  // have no schedule/salary/commission — just a login, name and starter password.
  const staffUsers = await prisma.user.findMany({
    where: { studioId: ctx.studioId, role: "STAFF" },
    select: {
      id: true, name: true, email: true, initialPassword: true,
      loginSessions: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
      pushTokens: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  })
  const staffRows = staffUsers.map((u) => {
    const web = u.loginSessions[0]?.lastSeenAt ?? null
    const mob = u.pushTokens[0]?.lastSeenAt ?? null
    const lastActiveAt = [web, mob]
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    return {
      kind: "STAFF" as const,
      id: u.id,
      name: u.name,
      lastActiveAt,
      user: { email: u.email, initialPassword: u.initialPassword },
    }
  })

  return NextResponse.json([...rows, ...staffRows])
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()

    // STAFF (cleaning/support): a bare User with role STAFF, a name and a login
    // (login need not be an email - existing staff use plain handles like
    // "1111"). No Trainer record, no whatsapp/commission.
    if (body.kind === "STAFF") {
      const StaffSchema = z.object({ name: z.string().min(2), email: z.string().min(2) })
      const sd = StaffSchema.parse(body)
      const login = sd.email.trim().toLowerCase()
      const existing = await prisma.user.findUnique({ where: { email: login } })
      if (existing) {
        return NextResponse.json({ error: "Login already in use" }, { status: 409 })
      }
      const pin = generatePin()
      const hashed = await bcrypt.hash(pin, 10)
      const user = await prisma.user.create({
        data: { email: login, password: hashed, role: "STAFF", name: sd.name.trim(), initialPassword: pin, studioId: ctx.studioId },
      })
      return NextResponse.json({ kind: "STAFF", id: user.id, name: user.name, user: { email: user.email }, initialPassword: pin }, { status: 201 })
    }

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

  // STAFF edit: name lives on the User row (staff have no Trainer record).
  if (searchParams.get("kind") === "STAFF") {
    const u = await prisma.user.findFirst({ where: { id, studioId: ctx.studioId, role: "STAFF" } })
    if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (name.length < 2) return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 })
      data.name = name
    }
    const updated = await prisma.user.update({
      where: { id: u.id },
      data,
      select: { id: true, name: true, email: true, initialPassword: true },
    })
    return NextResponse.json({ kind: "STAFF", id: updated.id, name: updated.name, user: { email: updated.email, initialPassword: updated.initialPassword } })
  }

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

  // Restore from (or send to) the archive.
  if (body.archived !== undefined) {
    updateData.archived = Boolean(body.archived)
  }

  if (body.notifyEmail !== undefined) {
    updateData.notifyEmail = !!body.notifyEmail
  }
  if (body.notifyWhatsapp !== undefined) {
    updateData.notifyWhatsapp = !!body.notifyWhatsapp
  }

  // Whether this trainer is in the round-robin pool for auto-assigned WhatsApp leads.
  if (body.inLeadRotation !== undefined) {
    updateData.inLeadRotation = !!body.inLeadRotation
  }

  // Delegated admin rights (Sveta 06.07.2026): the admin flips these per trainer.
  //   permBookAnyClass   — see the full studio schedule + add clients to any class.
  //   permManageBookings — reschedule / cancel any client booking.
  if (body.permInvertedPositions !== undefined) {
    updateData.permInvertedPositions = !!body.permInvertedPositions
  }
  if (body.permBookAnyClass !== undefined) {
    updateData.permBookAnyClass = !!body.permBookAnyClass
  }
  if (body.permManageBookings !== undefined) {
    updateData.permManageBookings = !!body.permManageBookings
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

  // STAFF: a bare User with no schedule/salary history, so a real delete is
  // safe (login sessions / push tokens / reset tokens cascade away).
  if (searchParams.get("kind") === "STAFF") {
    const u = await prisma.user.findFirst({ where: { id, studioId: ctx.studioId, role: "STAFF" } })
    if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await prisma.user.delete({ where: { id: u.id } })
    return NextResponse.json({ success: true, deleted: true })
  }

  const trainer = await prisma.trainer.findFirst({ where: { id, studioId: ctx.studioId } })
  if (!trainer) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // ARCHIVE, not delete (policy 2026-06-12, agreed with the owner): hard
  // deletion used to cascade away the trainer's salary history and orphan
  // past classes. Instead: hide the trainer (lists, login, assignment) and
  // unassign only FUTURE classes — past classes and payments stay intact for
  // reports. Restore any time via PATCH { archived: false }.
  const { baliDateStr } = await import("@/lib/tz")
  const today = baliDateStr(new Date())
  const [unassignedPrimary, unassignedAssistant] = await prisma.$transaction([
    prisma.timeSlot.updateMany({
      where: { trainerId: trainer.id, date: { gte: today } },
      data: { trainerId: null },
    }),
    prisma.timeSlot.updateMany({
      where: { assistantId: trainer.id, date: { gte: today } },
      data: { assistantId: null },
    }),
  ])
  await prisma.trainer.update({ where: { id: trainer.id }, data: { archived: true } })

  return NextResponse.json({
    success: true,
    archived: true,
    unassignedSlots: unassignedPrimary.count + unassignedAssistant.count,
  })
}
