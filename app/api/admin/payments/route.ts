import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { priceForTier } from "@/lib/payments"
import { studioDateStr, BALI_TZ } from "@/lib/tz"

// Admin "Bank confirmations" feed: every BankPayment parsed from a forwarded
// BRI QRIS SMS, newest first, with the booking it is linked to (if any) and -
// for unlinked ones - a ranked list of same-day bookings to link it to
// (matched by amount, then by how close the class time is to the payment time).

const HHMM = new Intl.DateTimeFormat("en-GB", {
  timeZone: BALI_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})
const baliTimeStr = (d: Date) => HHMM.format(d) // "14:34"
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + (m || 0)
}

type Suggestion = {
  id: string
  clientName: string
  date: string
  startTime: string
  classType: string
  trainerName: string | null
  price: number
  paymentType: string
  paymentStatus: string
  amountMatch: boolean
  alreadyLinked: boolean
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = new URL(request.url).searchParams
  // Lightweight mode for the sidebar badge: just the unmatched count, no rows.
  if (params.get("count")) {
    const unmatchedCount = await prisma.bankPayment.count({
      where: { studioId: ctx.studioId, bookingId: null },
    })
    return NextResponse.json({ unmatchedCount })
  }

  const filter = params.get("filter") ?? "unmatched"

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { localPrice: true, membershipClassPrice: true, groupPrice: true },
  })
  const memberPrice = studio?.membershipClassPrice ?? 250000
  const localPrice = studio?.localPrice ?? 200000

  const payments = await prisma.bankPayment.findMany({
    // Push the "to link" filter into SQL instead of fetching all 300 and
    // filtering in JS.
    where: { studioId: ctx.studioId, ...(filter === "unmatched" ? { bookingId: null } : {}) },
    orderBy: { paidAt: "desc" },
    take: 300,
    include: {
      booking: {
        select: {
          id: true,
          clientName: true,
          clientPhone: true,
          slot: { select: { date: true, startTime: true, classType: true } },
        },
      },
    },
  })

  // Always the true count of unmatched payments (independent of the filter),
  // so the "To link" tab badge stays accurate on the "All" view too.
  const unmatchedCount = await prisma.bankPayment.count({
    where: { studioId: ctx.studioId, bookingId: null },
  })

  // Same-day bookings to suggest for the UNLINKED payments in this page.
  const neededDates = Array.from(
    new Set(payments.filter((p) => !p.bookingId).map((p) => studioDateStr(p.paidAt))),
  )
  const candidates = neededDates.length
    ? await prisma.booking.findMany({
        where: {
          status: "CONFIRMED",
          slot: { studioId: ctx.studioId, date: { in: neededDates } },
        },
        select: {
          id: true,
          clientName: true,
          priceTier: true,
          localResident: true,
          paymentType: true,
          paymentStatus: true,
          slot: {
            select: {
              date: true,
              startTime: true,
              classType: true,
              price: true,
              trainer: { select: { name: true } },
            },
          },
        },
      })
    : []

  // Which bookings already have a bank payment linked (to flag in suggestions).
  const linkedBookingIds = new Set(payments.map((p) => p.bookingId).filter(Boolean) as string[])

  function suggestionsFor(paidAt: Date, amount: number): Suggestion[] {
    const day = studioDateStr(paidAt)
    const payMin = toMin(baliTimeStr(paidAt))
    return candidates
      .filter((b) => b.slot.date === day)
      .map((b) => {
        const price = priceForTier(
          { priceTier: b.priceTier, localResident: b.localResident },
          { slotPrice: b.slot.price, memberPrice, localPrice },
        )
        // A payment can match the single-class price OR any of the plausible
        // tier prices (the client may be a local / on member rate).
        const amountMatch =
          amount === price ||
          amount === b.slot.price ||
          amount === memberPrice ||
          amount === localPrice
        return {
          b,
          amountMatch,
          timeDiff: Math.abs(toMin(b.slot.startTime) - payMin),
          price,
        }
      })
      .sort((a, x) =>
        a.amountMatch !== x.amountMatch ? (a.amountMatch ? -1 : 1) : a.timeDiff - x.timeDiff,
      )
      .slice(0, 6)
      .map(({ b, amountMatch, price }) => ({
        id: b.id,
        clientName: b.clientName,
        date: b.slot.date,
        startTime: b.slot.startTime,
        classType: b.slot.classType,
        trainerName: b.slot.trainer?.name ?? null,
        price,
        paymentType: b.paymentType,
        paymentStatus: b.paymentStatus,
        amountMatch,
        alreadyLinked: linkedBookingIds.has(b.id),
      }))
  }

  const rows = payments
    .map((p) => ({
      id: p.id,
      amount: p.amount,
      reference: p.reference,
      channel: p.channel,
      sender: p.sender,
      rawText: p.rawText,
      paidAt: p.paidAt.toISOString(),
      paidDate: studioDateStr(p.paidAt),
      paidTime: baliTimeStr(p.paidAt),
      matchedAt: p.matchedAt ? p.matchedAt.toISOString() : null,
      booking: p.booking
        ? {
            id: p.booking.id,
            clientName: p.booking.clientName,
            date: p.booking.slot.date,
            startTime: p.booking.slot.startTime,
            classType: p.booking.slot.classType,
          }
        : null,
      suggestions: p.bookingId ? [] : suggestionsFor(p.paidAt, p.amount),
    }))

  return NextResponse.json({ payments: rows, unmatchedCount, totalCount: payments.length })
}
