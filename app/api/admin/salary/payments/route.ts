import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const PaymentSchema = z.object({
  trainerId: z.string(),
  amount: z.number().positive(),
  month: z.string(),
  note: z.string().optional(),
  // How the salary was paid — drives the Cash Flow "cash on hand" (only CASH
  // leaves the register). A payout "from safe" is always cash.
  method: z.enum(["CASH", "EDC", "QR", "TRANSFER"]).default("CASH"),
  // Salary handed out of the trainer's cash safe (safe feature): records a
  // matching SafeOperation in the same transaction so the box balance drops.
  fromSafe: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { fromSafe, ...data } = PaymentSchema.parse(body)
    // Paying out of the trainer's cash safe is by definition a cash payout.
    if (fromSafe) data.method = "CASH"

    // Verify trainer belongs to this studio
    const trainer = await prisma.trainer.findFirst({
      where: { id: data.trainerId, studioId: ctx.studioId },
    })
    if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.trainerPayment.create({
        data: { ...data, studioId: ctx.studioId },
      })
      if (fromSafe) {
        await tx.safeOperation.create({
          data: {
            studioId: ctx.studioId,
            trainerId: data.trainerId,
            kind: "salary",
            amount: -data.amount,
            note: data.note ?? `Salary ${data.month}`,
            paymentId: p.id,
            createdByUserId: ctx.userId,
          },
        })
      }
      return p
    })
    return NextResponse.json(payment, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  const result = await prisma.trainerPayment.deleteMany({ where: { id, studioId: ctx.studioId } })
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // A deleted payment takes its paid-from-safe record with it, or the box
  // balance would stay reduced by a payout that never happened.
  await prisma.safeOperation.deleteMany({ where: { paymentId: id, studioId: ctx.studioId } })
  return NextResponse.json({ success: true })
}
