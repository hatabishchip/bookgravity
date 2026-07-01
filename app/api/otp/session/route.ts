import { NextRequest, NextResponse } from "next/server"
import { getPublicStudioId } from "@/lib/studio"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { prisma } from "@/lib/prisma"
import { hasOtpSession, attachOtpSession } from "@/lib/otp-session"
import { getVerifiedClientDetails } from "@/lib/client-lookup"

export const dynamic = "force-dynamic"

// GET /api/otp/session?phone=<phone>&studio=<slug>
// "Does THIS device already trust this number?" Called by the booking widget
// the moment a number is fully typed, BEFORE sending any WhatsApp code. If the
// device holds a valid trust session for this phone+studio, the client skips
// the code entirely: we return their known name/email (same privacy gate as a
// fresh code - the session is as strong as the code it was minted from) and
// slide the session forward another 400 days. Otherwise { verified: false } and
// the widget falls back to sending a code.
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const phone = url.searchParams.get("phone") ?? ""
    if (phone.replace(/\D/g, "").length < 6) {
      return NextResponse.json({ verified: false })
    }
    const studioId = await getPublicStudioId(url.searchParams.get("studio"))

    // If the studio doesn't require OTP, there's nothing to skip - let the
    // widget's normal (no-code) path handle it.
    const enabled = await isStudioWhatsAppEnabled(studioId)
    const studio = enabled
      ? await prisma.studio.findUnique({ where: { id: studioId }, select: { requireBookingOtp: true } })
      : null
    const otpRequired = enabled && studio?.requireBookingOtp !== false
    if (!otpRequired) return NextResponse.json({ verified: false })

    if (!hasOtpSession(request, { phone, studioId })) {
      return NextResponse.json({ verified: false })
    }

    const client = await getVerifiedClientDetails({ studioId, phone })
    const res = NextResponse.json({ verified: true, client })
    // Sliding window: touching the session renews it another 400 days.
    attachOtpSession(request, res, { phone, studioId })
    return res
  } catch (err) {
    console.error("[otp/session] error:", err)
    return NextResponse.json({ verified: false })
  }
}
