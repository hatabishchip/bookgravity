import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getMembershipBalance, phoneTail } from "@/lib/membership"
import { z } from "zod"

// Memberships are sold at the studio by a trainer or an admin. Both hit this
// endpoint; we scope to the seller's studioId and record who sold it.
const CreateSchema = z.object({
  clientPhone: z.string().min(5),
  clientName: z.string().trim().optional(),
  paymentType: z.enum(["CASH", "EDC", "QR", "TRANSFER"]).default("CASH"),
  note: z.string().trim().optional(),
})

const MEMBERSHIP_CLASSES = 5

function canSell(role: string): boolean {
  return role === "TRAINER" || role === "ADMIN" || role === "SUPER_ADMIN"
}

async function sellerLabel(userId: string, role: string): Promise<string | null> {
  if (role === "TRAINER") {
    const t = await prisma.trainer.findFirst({ where: { userId }, select: { name: true } })
    if (t?.name) return t.name
  }
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  return u?.email ?? null
}

// GET /api/memberships?phone=... → balance + purchase history for that phone at
// this studio. Used by the sell dialog to show "already has N classes".
export async function GET(request: NextRequest) {
  const ctx = await requireAuth()
  if (!ctx || !canSell(ctx.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const phone = searchParams.get("phone")?.trim()
  if (!phone) return NextResponse.json({ remaining: 0, memberships: [] })

  const tail = phoneTail(phone)
  if (tail.length < 6) return NextResponse.json({ remaining: 0, memberships: [] })

  const memberships = await prisma.membership.findMany({
    where: { studioId: ctx.studioId, clientPhone: { contains: tail } },
    orderBy: { createdAt: "desc" },
  })
  const remaining = memberships.reduce((s, m) => s + m.remainingClasses, 0)
  return NextResponse.json({ remaining, memberships })
}

// POST /api/memberships → sell a new 5-class membership.
export async function POST(request: NextRequest) {
  const ctx = await requireAuth()
  if (!ctx || !canSell(ctx.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const data = CreateSchema.parse(body)

  const soldByName = await sellerLabel(ctx.userId, ctx.role)

  const created = await prisma.membership.create({
    data: {
      studioId: ctx.studioId,
      clientPhone: data.clientPhone,
      clientName: data.clientName || null,
      totalClasses: MEMBERSHIP_CLASSES,
      remainingClasses: MEMBERSHIP_CLASSES,
      paymentType: data.paymentType,
      soldByUserId: ctx.userId,
      soldByName,
      note: data.note || null,
    },
  })

  const remaining = await getMembershipBalance(ctx.studioId, data.clientPhone)
  return NextResponse.json({ membership: created, remaining })
}
