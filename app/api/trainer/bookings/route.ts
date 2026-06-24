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
      // Only active bookings - a cancelled one drops off the roster entirely.
      status: "CONFIRMED",
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
  // Studio country + local price drive the "Local" toggle (Indonesia only).
  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { country: true, localPrice: true, membershipClassPrice: true },
  })
  const withBalance = bookings.map((b) => ({
    ...b,
    membershipRemaining: balances.get(phoneTail(b.clientPhone)) ?? 0,
    studioCountry: studio?.country ?? null,
    localPrice: studio?.localPrice ?? 200000,
    memberPrice: studio?.membershipClassPrice ?? 250000,
  }))

  return NextResponse.json(withBalance)
}
