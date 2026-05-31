import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"

export const dynamic = "force-dynamic"

// Returns the most recently used name for a given phone, across ALL studios.
// A returning client should see whichever name they last typed in — even if
// the prior booking was at a different studio under the same brand. Scoping
// the lookup per-studio caused stale names to autofill when the client had
// updated their name on the other studio's widget.
//
// When a `studio` slug is passed we also return `membershipRemaining`: the
// number of unused membership classes this phone has at THAT studio (memberships
// are per-studio). This is informational only — clients never spend a class
// themselves; a trainer deducts it at the studio.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get("phone")?.trim()
  const studioSlug = searchParams.get("studio")?.trim() || undefined
  if (!phone || phone.length < 5) return NextResponse.json({ name: null, membershipRemaining: 0 })

  try {
    // Most recent name (across all studios)
    const nameBooking = await prisma.booking.findFirst({
      where: { clientPhone: phone },
      orderBy: { createdAt: "desc" },
      select: { clientName: true },
    })
    // Most recent NON-EMPTY email — earliest bookings had empty clientEmail
    // before we added the field to the widget, so we skip those.
    const emailBooking = await prisma.booking.findFirst({
      where: { clientPhone: phone, clientEmail: { not: "" } },
      orderBy: { createdAt: "desc" },
      select: { clientEmail: true },
    })
    const cleanName = nameBooking?.clientName?.replace(/\s*\(\d+\/\d+\)$/, "").trim() || null

    // Membership balance for this studio. Match on the last 10 digits so a
    // slightly different formatting (spaces, leading 0 vs +62) still resolves —
    // same approach the WhatsApp webhook uses for phone matching.
    let membershipRemaining = 0
    const tail = phone.replace(/\D/g, "").slice(-10)
    if (tail.length >= 6) {
      const studioId = await getPublicStudioId(studioSlug)
      const rows = await prisma.membership.findMany({
        where: { studioId, clientPhone: { contains: tail }, remainingClasses: { gt: 0 } },
        select: { remainingClasses: true },
      })
      membershipRemaining = rows.reduce((sum, r) => sum + r.remainingClasses, 0)
    }

    return NextResponse.json({
      name: cleanName,
      email: emailBooking?.clientEmail ?? null,
      membershipRemaining,
    })
  } catch {
    return NextResponse.json({ name: null, membershipRemaining: 0 })
  }
}
