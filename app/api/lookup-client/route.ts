import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getStudioIdBySubdomain } from "@/lib/studio"

export const dynamic = "force-dynamic"

// Returns the most recent booking name for a given phone in the current studio.
// Used by the booking widget to auto-fill the name field for returning clients.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phone = searchParams.get("phone")?.trim()
  if (!phone || phone.length < 5) return NextResponse.json({ name: null })

  try {
    const studioId = await getStudioIdBySubdomain()
    const booking = await prisma.booking.findFirst({
      where: {
        clientPhone: phone,
        slot: { studioId },
      },
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
