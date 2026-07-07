import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { expectedInDrawer } from "@/lib/cash"

// POST /api/admin/cash-count - record a physical cash-drawer recount.
// The server recomputes what it EXPECTED (never trusts the client), stores the
// difference (expected - counted; positive = money missing), and returns it.
// After this, the running "expected in drawer" equals the counted amount, so
// the next comparison starts clean. This is Sveta's anti-"приписки" control.
const BodySchema = z.object({
  counted: z.number().min(0),
  note: z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the counted cash amount" }, { status: 400 })
  }

  const expected = await expectedInDrawer(ctx.studioId)
  const difference = expected - parsed.data.counted

  const count = await prisma.cashCount.create({
    data: {
      studioId: ctx.studioId,
      counted: parsed.data.counted,
      expected,
      difference,
      note: parsed.data.note ?? null,
      createdByUserId: ctx.userId,
    },
  })

  return NextResponse.json(
    { id: count.id, counted: count.counted, expected: count.expected, difference: count.difference },
    { status: 201 },
  )
}
