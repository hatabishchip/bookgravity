import { NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { computeSafeBalances, isSafeEnabled } from "@/lib/safe"

// GET /api/trainer/safe — this trainer's own cash-safe balance + their recent
// operations, shown in the cabinet so the number can be checked against the
// physical box. 404 while the feature is off for the studio.
export async function GET() {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isSafeEnabled(ctx.studioId))) {
    return NextResponse.json({ error: "Safe tracking is not enabled for this studio" }, { status: 404 })
  }

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
    select: { id: true },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const balances = await computeSafeBalances(ctx.studioId)
  const mine = balances.find((b) => b.trainerId === trainer.id)

  const operations = await prisma.safeOperation.findMany({
    where: { studioId: ctx.studioId, trainerId: trainer.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  return NextResponse.json({
    balance: mine?.balance ?? 0,
    cashIn: mine?.cashIn ?? 0,
    operations: operations.map((o) => ({
      id: o.id,
      kind: o.kind,
      amount: o.amount,
      note: o.note,
      createdAt: o.createdAt,
    })),
  })
}
