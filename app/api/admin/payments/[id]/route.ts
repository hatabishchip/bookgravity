import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// Link / unlink a bank payment to a booking (admin, one tap). Linking is the
// only thing that turns on the staff-only "confirmed by bank" badge; it does
// NOT touch the booking's own paymentType/paymentStatus (the trainer's manual
// accounting stays independent).

const PatchSchema = z.object({
  // string = link to that booking; null = unlink.
  bookingId: z.string().nullable(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const payment = await prisma.bankPayment.findFirst({
    where: { id, studioId: ctx.studioId },
    select: { id: true },
  })
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const { bookingId } = parsed.data

  if (bookingId) {
    // The target booking must belong to this studio.
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, slot: { studioId: ctx.studioId } },
      select: { id: true },
    })
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  const updated = await prisma.bankPayment.update({
    where: { id },
    data: {
      bookingId,
      matchedByUserId: bookingId ? ctx.userId : null,
      matchedAt: bookingId ? new Date() : null,
    },
    select: { id: true, bookingId: true },
  })

  return NextResponse.json({ ok: true, ...updated })
}
