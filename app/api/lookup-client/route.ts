import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Returns the most recently used name for a given phone, across ALL studios.
// A returning client should see whichever name they last typed in — even if
// the prior booking was at a different studio under the same brand. Scoping
// the lookup per-studio caused stale names to autofill when the client had
// updated their name on the other studio's widget.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get("phone")?.trim()
  if (!phone || phone.length < 5) return NextResponse.json({ name: null })

  try {
    const booking = await prisma.booking.findFirst({
      where: { clientPhone: phone },
      orderBy: { createdAt: "desc" },
      select: { clientName: true },
    })
    if (!booking?.clientName) return NextResponse.json({ name: null })
    // Strip "(1/3)" party suffix that gets added at booking time
    const cleanName = booking.clientName.replace(/\s*\(\d+\/\d+\)$/, "").trim()
    return NextResponse.json({ name: cleanName })
  } catch {
    return NextResponse.json({ name: null })
  }
}
