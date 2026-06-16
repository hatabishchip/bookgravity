import { NextRequest, NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getStudioMembershipBalances, phoneTail } from "@/lib/membership"

export async function GET(request: NextRequest) {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const trainer = await prisma.trainer.findFirst({
    where: { userId: ctx.userId, studioId: ctx.studioId, archived: false },
  })
  if (!trainer) return NextResponse.json({ error: "Trainer not found" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const slotId = searchParams.get("slotId")

  const bookings = await prisma.booking.findMany({
    where: {
      slot: { trainerId: trainer.id, studioId: ctx.studioId },
      // In a single class roster (slotId given) keep no-shows visible so the
      // trainer can see them and undo a mistake. The flat "All my bookings"
      // list (no slotId) stays active-only.
      status: slotId ? { in: ["CONFIRMED", "NO_SHOW"] } : "CONFIRMED",
      ...(slotId ? { slotId } : {}),
    },
    include: {
      slot: true,
      services: { include: { service: true } },
    },
    orderBy: [{ slot: { date: "asc" } }, { slot: { startTime: "asc" } }],
  })

  // Attach each client's current membership balance so the trainer can offer
  // "pay from membership" only when there's a class to spend.
  const balances = await getStudioMembershipBalances(ctx.studioId)
  const withBalance = bookings.map((b) => ({
    ...b,
    membershipRemaining: balances.get(phoneTail(b.clientPhone)) ?? 0,
  }))

  return NextResponse.json(withBalance)
}
