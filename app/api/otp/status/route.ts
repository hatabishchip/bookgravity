import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { normalizeOtpPhone, otpFallbackDue, sendOtpFallback } from "@/lib/otp"
import { getConfigFor } from "@/lib/whatsapp-cloud"

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
      select: { id: true, code: true, status: true, statusError: true, createdAt: true, fallbackAt: true },
    })
    if (!row) return NextResponse.json({ status: "none" })

    // AUTH templates deliver only to the client's PRIMARY device. A code still
    // "sent" after a few seconds is likely stuck (WhatsApp lives on a linked
    // device / web) - re-send the SAME code once via the admin_message utility
    // template, which reaches every device. The poll drives this, and the
    // updateMany claim keeps concurrent polls from double-sending.
    if (otpFallbackDue(row)) {
      const claimed = await prisma.bookingOtp.updateMany({
        where: { id: row.id, fallbackAt: null },
        data: { fallbackAt: new Date() },
      })
      if (claimed.count === 1) {
        const studio = await prisma.studio.findUnique({
          where: { id: studioId },
          select: { whatsappPhoneNumberId: true, whatsappAccessToken: true },
        })
        await sendOtpFallback({ rowId: row.id, phone, code: row.code, config: getConfigFor(studio) })
      }
    }

    return NextResponse.json({ status: row.status, error: row.statusError ?? undefined })
  } catch {
    return NextResponse.json({ status: "none" })
  }
}
