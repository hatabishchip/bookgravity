import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { phoneTail } from "@/lib/membership"

// GET /api/admin/clients/history?phone=<as stored>
//
// Full per-client dossier for the Clients section: every booking ever made
// (confirmed AND cancelled) with class/trainer/payment details, plus all
// membership batches with their remaining balance. Matched by the last 10
// digits of the phone — stored formats vary between manual entry and the
// public widget ("+62 821-4554-6405" vs "+6282145546405").
export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const phone = new URL(request.url).searchParams.get("phone") ?? ""
  const tail = phoneTail(phone)
  if (!tail || tail.length < 6) {
    return NextResponse.json({ error: "phone required" }, { status: 400 })
  }

  const [allBookings, allMemberships] = await Promise.all([
    prisma.booking.findMany({
      where: { slot: { studioId: ctx.studioId } },
      select: {
        id: true,
        clientPhone: true,
        status: true,
        paymentType: true,
        paymentStatus: true,
        checkedIn: true,
        ticketCode: true,
        createdAt: true,
        updatedAt: true,
        membershipId: true,
        services: { select: { service: { select: { name: true } } } },
        slot: {
          select: {
            date: true,
            startTime: true,
            endTime: true,
            classType: true,
            trainer: { select: { name: true } },
          },
        },
      },
    }),
    prisma.membership.findMany({
      where: { studioId: ctx.studioId },
      select: {
        id: true,
        clientPhone: true,
        totalClasses: true,
        remainingClasses: true,
        paymentType: true,
        soldByName: true,
        note: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const bookings = allBookings
    .filter((b) => phoneTail(b.clientPhone) === tail)
    .sort((a, b) => (b.slot.date + b.slot.startTime).localeCompare(a.slot.date + a.slot.startTime))
    .map((b) => ({
      id: b.id,
      date: b.slot.date,
      startTime: b.slot.startTime,
      endTime: b.slot.endTime,
      classType: b.slot.classType,
      trainerName: b.slot.trainer?.name ?? null,
      status: b.status,
      paymentType: b.paymentType,
      paymentStatus: b.paymentStatus,
      checkedIn: b.checkedIn,
      ticketCode: b.ticketCode,
      bookedAt: b.createdAt.toISOString(),
      // For cancelled rows updatedAt ≈ when the cancellation happened.
      cancelledAt: b.status === "CANCELLED" ? b.updatedAt.toISOString() : null,
      services: b.services.map((s) => s.service.name),
      viaMembership: !!b.membershipId,
    }))

  const memberships = allMemberships
    .filter((m) => phoneTail(m.clientPhone) === tail)
    .map((m) => ({
      id: m.id,
      totalClasses: m.totalClasses,
      remainingClasses: m.remainingClasses,
      paymentType: m.paymentType,
      soldByName: m.soldByName,
      note: m.note,
      soldAt: m.createdAt.toISOString(),
    }))

  return NextResponse.json({ bookings, memberships })
}
