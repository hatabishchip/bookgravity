import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { isSafeEnabled } from "@/lib/safe"

// POST /api/admin/safe/operations — record a manual safe movement:
//   withdrawal — the owner/admin took `amount` out of the trainer's box
//                (stored negative);
//   correction — recount result: `amount` here is the DELTA to apply, signed
//                (the UI computes it from "the box actually holds Y"), note
//                required so every adjustment says why.
// Salary payouts are NOT created here — the salary payment endpoint writes
// them atomically with the TrainerPayment.
const BodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("withdrawal"),
    trainerId: z.string().min(1),
    amount: z.number().positive(),
    note: z.string().optional(),
  }),
  z.object({
    kind: z.literal("correction"),
    trainerId: z.string().min(1),
    amount: z.number().refine((n) => n !== 0, "Correction can't be zero"),
    note: z.string().min(1, "A correction needs a reason"),
  }),
])

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isSafeEnabled(ctx.studioId))) {
    return NextResponse.json({ error: "Safe tracking is not enabled for this studio" }, { status: 404 })
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((e) => e.message).join("; ") },
      { status: 400 },
    )
  }
  const data = parsed.data

  const trainer = await prisma.trainer.findFirst({
    where: { id: data.trainerId, studioId: ctx.studioId },
    select: { id: true },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const op = await prisma.safeOperation.create({
    data: {
      studioId: ctx.studioId,
      trainerId: data.trainerId,
      kind: data.kind,
      amount: data.kind === "withdrawal" ? -data.amount : data.amount,
      note: data.note ?? null,
      createdByUserId: ctx.userId,
    },
  })
  return NextResponse.json(op, { status: 201 })
}
