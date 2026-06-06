import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { normalizeOtpPhone } from "@/lib/otp"

export const dynamic = "force-dynamic"

// GET /api/otp/status?phone=...&studio=...
// Reports the WhatsApp delivery status of the latest code sent to this number,
// so the booking widget can tell a client whose number isn't on WhatsApp
// (status "failed") instead of leaving them waiting. Returns:
//   { status: "sent" | "delivered" | "read" | "failed" | "none", error?: string }
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const phoneRaw = searchParams.get("phone") ?? ""
  const phone = normalizeOtpPhone(phoneRaw)
  if (!phone || phone.length < 7) return NextResponse.json({ status: "none" })

  try {
    const studioId = await getPublicStudioId(searchParams.get("studio"))
    const row = await prisma.bookingOtp.findFirst({
      where: { studioId, phone },
      orderBy: { createdAt: "desc" },
      select: { status: true, statusError: true },
    })
    if (!row) return NextResponse.json({ status: "none" })
    return NextResponse.json({ status: row.status, error: row.statusError ?? undefined })
  } catch {
    return NextResponse.json({ status: "none" })
  }
}
