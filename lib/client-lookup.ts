import { prisma } from "@/lib/prisma"
import { getMembershipBalance, phoneTail } from "@/lib/membership"

// Privacy-safe lookup of a client's last-used details for the booking widget.
// ONLY call this once the caller has proven ownership of the number (a fresh
// WhatsApp code, or a valid device trust session) - a phone number alone must
// never surface someone's name/email.
//
// Scoped to THIS studio (via slot.studioId): the same phone may have booked at
// another studio, and one studio must never leak a name/email the client only
// gave to a different studio. Matches by the 10-digit phone tail (endsWith),
// not exact string: phones are stored digits-only ("6282…") but the widget
// posts the country-code form ("+6282…"), so an exact match misses returnees.

export type ClientDetails = { name: string | null; email: string | null; membershipRemaining: number }

export async function getVerifiedClientDetails(opts: {
  studioId: string
  phone: string
}): Promise<ClientDetails> {
  const { studioId, phone } = opts
  const tail = phoneTail(phone)
  if (tail.length < 6) return { name: null, email: null, membershipRemaining: 0 }

  const [nameBooking, emailBooking, membershipRemaining] = await Promise.all([
    prisma.booking.findFirst({
      where: { clientPhone: { endsWith: tail }, slot: { studioId } },
      orderBy: { createdAt: "desc" },
      select: { clientName: true },
    }),
    prisma.booking.findFirst({
      where: { clientPhone: { endsWith: tail }, clientEmail: { not: "" }, slot: { studioId } },
      orderBy: { createdAt: "desc" },
      select: { clientEmail: true },
    }),
    getMembershipBalance(studioId, phone),
  ])

  const cleanName = nameBooking?.clientName?.replace(/\s*\(\d+\/\d+\)$/, "").trim() || null
  return {
    name: cleanName,
    email: emailBooking?.clientEmail ?? null,
    membershipRemaining,
  }
}
