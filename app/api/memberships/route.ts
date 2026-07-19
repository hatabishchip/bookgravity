import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getMembershipBalance, phoneTail } from "@/lib/membership"
import { z } from "zod"

// Memberships are sold at the studio by a trainer or an admin. Both hit this
// endpoint; we scope to the seller's studioId and record who sold it.
const CreateSchema = z.object({
  clientPhone: z.string().min(5).transform((p) => p.replace(/\D/g, "")),
  clientName: z.string().trim().optional(),
  // FREE (admin-only): gifted cards and cards paid long ago, entered after the
  // fact - recorded with classPrice 0 so cashflow never counts them as income
  // (cashflow already filters by isCashMethod; Sveta 19.07).
  paymentType: z.enum(["CASH", "EDC", "QR", "TRANSFER", "FREE"]).default("CASH"),
  // Member card size - exactly two products (owner 10.07): pay for 5 -> 6
  // classes on the card (1.5M), pay for 10 -> 12 (3M). The bonus classes are
  // already included here; cashflow prices the sale as classPrice x total,
  // which lands on exactly 1.5M / 3M at 250k. No free-form sizes on purpose.
  totalClasses: z.union([z.literal(6), z.literal(12)]).default(6),
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

  // Studio membership pricing, shown in the sell dialog before a phone is typed.
  const studio = await prisma.studio.findUnique({ where: { id: ctx.studioId }, select: { membershipClassPrice: true } })
  const isAdmin = ctx.role === "ADMIN" || ctx.role === "SUPER_ADMIN"
  const pricing = { membershipClassPrice: studio?.membershipClassPrice ?? 250000, membershipClasses: MEMBERSHIP_CLASSES, isAdmin }

  try {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get("phone")?.trim()
  // ?list=1 → every client at this studio who has ever been sold a membership,
  // grouped by phone (newest purchase first). Powers the Membership section.
  if (searchParams.get("list")) {
    const all = await prisma.membership.findMany({
      where: { studioId: ctx.studioId },
      orderBy: { createdAt: "desc" },
    })
    type Group = {
      clientPhone: string
      clientName: string | null
      remaining: number
      totalSold: number
      purchases: number
      lastSoldAt: Date
      lastSoldBy: string | null
    }
    const groups = new Map<string, Group>()
    for (const m of all) {
      const key = phoneTail(m.clientPhone)
      const g = groups.get(key)
      if (g) {
        g.remaining += m.remainingClasses
        g.totalSold += m.totalClasses
        g.purchases += 1
        if (!g.clientName && m.clientName) g.clientName = m.clientName
      } else {
        groups.set(key, {
          clientPhone: m.clientPhone,
          clientName: m.clientName ?? null,
          remaining: m.remainingClasses,
          totalSold: m.totalClasses,
          purchases: 1,
          lastSoldAt: m.createdAt,
          lastSoldBy: m.soldByName ?? null,
        })
      }
    }
    return NextResponse.json({ clients: Array.from(groups.values()), ...pricing })
  }

  if (!phone) return NextResponse.json({ remaining: 0, memberships: [], ...pricing })

  const tail = phoneTail(phone)
  if (tail.length < 6) return NextResponse.json({ remaining: 0, memberships: [], name: null, ...pricing })

  // Phones are digits-only since 2026-06-12 → indexed endsWith query instead
  // of the old fetch-every-membership-and-filter-in-memory scan.
  const memberships = await prisma.membership.findMany({
    where: { studioId: ctx.studioId, clientPhone: { endsWith: tail } },
    orderBy: { createdAt: "desc" },
  })
  const remaining = memberships.reduce((s, m) => s + m.remainingClasses, 0)

  // Best-known client name: latest membership name, else a booking under this
  // phone (indexed endsWith), else the WhatsApp contact name (Sveta 19.07:
  // clients who chatted but never booked online still auto-fill).
  let name = memberships.find((m) => m.clientName)?.clientName ?? null
  if (!name) {
    const hit = await prisma.booking.findFirst({
      where: { clientPhone: { endsWith: tail }, slot: { studioId: ctx.studioId } },
      orderBy: { createdAt: "desc" },
      select: { clientName: true },
    })
    name = hit?.clientName?.replace(/\s*\(\d+\/\d+\)$/, "").trim() || null
  }
  if (!name) {
    const wa = await prisma.whatsAppConversation.findFirst({
      where: { studioId: ctx.studioId, clientPhone: { contains: tail } },
      orderBy: { lastMessageAt: "desc" },
      select: { clientName: true },
    })
    // WA names can be handles/emoji - still better than empty; seller can edit.
    name = wa?.clientName?.trim() || null
  }

  // Do we know this number is on WhatsApp? The Cloud API can't check arbitrary
  // numbers, but if we have a conversation with them they're reachable on
  // WhatsApp. Conversation phones are normalized to digits, so contains works.
  const convo = await prisma.whatsAppConversation.findFirst({
    where: { studioId: ctx.studioId, clientPhone: { contains: tail } },
    select: { id: true },
  })
  const hasWhatsApp = !!convo

  return NextResponse.json({ remaining, memberships, name, hasWhatsApp, ...pricing })
  } catch (err) {
    console.error("[memberships] GET failed:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/memberships → sell a new 5-class membership.
export async function POST(request: NextRequest) {
  const ctx = await requireAuth()
  if (!ctx || !canSell(ctx.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const data = CreateSchema.parse(body)

  const isAdmin = ctx.role === "ADMIN" || ctx.role === "SUPER_ADMIN"
  if (data.paymentType === "FREE" && !isAdmin) {
    return NextResponse.json({ error: "Free cards can only be issued by an admin" }, { status: 403 })
  }

  const soldByName = await sellerLabel(ctx.userId, ctx.role)

  // Record the per-class price at sale time so reports stay accurate later.
  const studio = await prisma.studio.findUnique({ where: { id: ctx.studioId }, select: { membershipClassPrice: true } })

  const created = await prisma.membership.create({
    data: {
      studioId: ctx.studioId,
      clientPhone: data.clientPhone,
      clientName: data.clientName || null,
      totalClasses: data.totalClasses,
      remainingClasses: data.totalClasses,
      classPrice: data.paymentType === "FREE" ? 0 : (studio?.membershipClassPrice ?? 250000),
      paymentType: data.paymentType,
      soldByUserId: ctx.userId,
      soldByName,
      note: data.note || null,
    },
  })

  const remaining = await getMembershipBalance(ctx.studioId, data.clientPhone)
  return NextResponse.json({ membership: created, remaining })
}

// PATCH /api/memberships { action: "deduct", clientPhone, classes, note? }
// Admin-only (Sveta 19.07): burn already-used classes retroactively - e.g. the
// card was sold on paper days ago and the client attended before it was entered.
// Consumes from the OLDEST cards first, same direction real usage does.
const DeductSchema = z.object({
  action: z.literal("deduct"),
  clientPhone: z.string().min(5).transform((p) => p.replace(/\D/g, "")),
  classes: z.number().int().min(1).max(24),
  note: z.string().trim().optional(),
})

export async function PATCH(request: NextRequest) {
  const ctx = await requireAuth()
  if (!ctx || (ctx.role !== "ADMIN" && ctx.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  }
  const data = DeductSchema.parse(await request.json())
  const tail = phoneTail(data.clientPhone)
  if (tail.length < 6) return NextResponse.json({ error: "Phone too short" }, { status: 400 })

  const cards = await prisma.membership.findMany({
    where: { studioId: ctx.studioId, remainingClasses: { gt: 0 }, clientPhone: { endsWith: tail } },
    orderBy: { createdAt: "asc" },
    select: { id: true, remainingClasses: true, note: true },
  })
  const available = cards.reduce((s, c) => s + c.remainingClasses, 0)
  if (available < data.classes) {
    return NextResponse.json(
      { error: `Client only has ${available} classes left - cannot deduct ${data.classes}` },
      { status: 409 },
    )
  }
  let left = data.classes
  const stamp = `[-${data.classes} by admin ${new Date().toISOString().slice(0, 10)}${data.note ? ": " + data.note : ""}]`
  for (const c of cards) {
    if (left <= 0) break
    const take = Math.min(left, c.remainingClasses)
    await prisma.membership.update({
      where: { id: c.id },
      data: {
        remainingClasses: { decrement: take },
        note: c.note ? `${c.note} ${stamp}` : stamp,
      },
    })
    left -= take
  }
  const remaining = await getMembershipBalance(ctx.studioId, data.clientPhone)
  return NextResponse.json({ ok: true, deducted: data.classes, remaining })
}

// DELETE /api/memberships?id=... - admin-only cancel of a mistaken sale.
// Refuses if any booking was already paid from this card (protects history);
// the admin then uses "deduct" instead, or reassigns those bookings first.
export async function DELETE(request: NextRequest) {
  const ctx = await requireAuth()
  if (!ctx || (ctx.role !== "ADMIN" && ctx.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  }
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const card = await prisma.membership.findFirst({
    where: { id, studioId: ctx.studioId },
    include: { _count: { select: { bookings: true } } },
  })
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (card._count.bookings > 0) {
    return NextResponse.json(
      { error: `This card already paid for ${card._count.bookings} booking(s) - it cannot be cancelled. Use "deduct classes" instead.` },
      { status: 409 },
    )
  }
  await prisma.membership.delete({ where: { id: card.id } })
  return NextResponse.json({ ok: true })
}
