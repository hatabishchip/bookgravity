import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { getMembershipBalance } from "@/lib/membership"
import { rateLimit, clientIp } from "@/lib/rate-limit"

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
//
// PRIVACY: this endpoint is UNAUTHENTICATED (the booking widget calls it before
// any login), so it must never leak identifying data an attacker could harvest
// by spraying phone numbers. It returns ONLY the display name (for autofill) and
// the membership count — never email or other PII. An IP rate-limit caps
// enumeration. Full identity (email etc.) is only ever returned after WhatsApp
// OTP proof-of-ownership (see getVerifiedClientDetails / /api/otp/verify).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get("phone")?.trim()
  const studioSlug = searchParams.get("studio")?.trim() || undefined
  if (!phone || phone.length < 5) return NextResponse.json({ name: null, membershipRemaining: 0 })

  // Cap phone-number enumeration from a single IP. Fail-open (limiter down must
  // not block real bookings). Studio wifi = one shared IP, so keep it generous.
  const rl = await rateLimit({ scope: "lookup-ip", subject: clientIp(request), limit: 40, windowSec: 3600 })
  if (!rl.ok) return NextResponse.json({ name: null, membershipRemaining: 0 }, { status: 429 })

  try {
    // Match by 10-digit phone tail (endsWith), not exact string. Since the
    // 2026-06-12 normalization phones are stored digits-only ("6282…") but
    // callers still pass the country-code form ("+6282…"); exact-equals
    // misses every returning client. Same fix as /api/otp/verify.
    const tail = phone.replace(/\D/g, "").slice(-10)
    const tooShort = tail.length < 6

    // Most recent name (across all studios) — for autofill only. No email.
    const nameBooking = tooShort
      ? null
      : await prisma.booking.findFirst({
          where: { clientPhone: { endsWith: tail } },
          orderBy: { createdAt: "desc" },
          select: { clientName: true },
        })
    const cleanName = nameBooking?.clientName?.replace(/\s*\(\d+\/\d+\)$/, "").trim() || null

    // Membership balance for this studio. The helper already matches by tail.
    let membershipRemaining = 0
    if (!tooShort) {
      const studioId = await getPublicStudioId(studioSlug)
      membershipRemaining = await getMembershipBalance(studioId, phone)
    }

    return NextResponse.json({
      name: cleanName,
      membershipRemaining,
    })
  } catch {
    return NextResponse.json({ name: null, membershipRemaining: 0 })
  }
}
