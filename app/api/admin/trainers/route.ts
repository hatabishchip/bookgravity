import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import bcrypt from "bcryptjs"

const TrainerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
})

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainers = await prisma.trainer.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(trainers)
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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
        trainer: { create: { name: data.name } },
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
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

  const trainer = await prisma.trainer.update({
    where: { id },
    data: updateData,
    include: { user: { select: { email: true } } },
  })
  return NextResponse.json(trainer)
}

export async function DELETE(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  const trainer = await prisma.trainer.findUnique({ where: { id } })
  if (!trainer) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.user.delete({ where: { id: trainer.userId } })
  return NextResponse.json({ success: true })
}
