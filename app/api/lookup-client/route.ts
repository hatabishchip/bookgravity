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
    return NextResponse.json({ name: cleanName, email: emailBooking?.clientEmail ?? null })
  } catch {
    return NextResponse.json({ name: null })
  }
}
