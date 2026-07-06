import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { computeSafeBalances, isSafeEnabled } from "@/lib/safe"

// GET /api/admin/safe — every trainer's cash-safe balance + the operations
// history for the studio. 404 while the feature is off for this studio (the
// super-admin flips Studio.safeEnabled).
export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isSafeEnabled(ctx.studioId))) {
    return NextResponse.json({ error: "Safe tracking is not enabled for this studio" }, { status: 404 })
  }

  const [balances, operations] = await Promise.all([
    computeSafeBalances(ctx.studioId),
    prisma.safeOperation.findMany({
      where: { studioId: ctx.studioId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { trainer: { select: { name: true } } },
    }),
  ])

  return NextResponse.json({
    balances,
    total: balances.reduce((s, b) => s + b.balance, 0),
    operations: operations.map((o) => ({
      id: o.id,
      trainerId: o.trainerId,
      trainerName: o.trainer.name,
      kind: o.kind,
      amount: o.amount,
      note: o.note,
      createdAt: o.createdAt,
    })),
  })
}
