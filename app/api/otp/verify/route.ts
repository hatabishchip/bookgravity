import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { verifyBookingOtp } from "@/lib/otp"
import { attachOtpSession } from "@/lib/otp-session"
import { getVerifiedClientDetails } from "@/lib/client-lookup"

export const dynamic = "force-dynamic"

// POST /api/otp/verify  body: { phone, code }  query: ?studio=<slug>
// Checks the WhatsApp code. ONLY on success do we return the client's known
// name/email — a phone number alone must never leak someone's details, so the
// lookup is gated behind proving ownership of the number via the code.
const Schema = z.object({
  phone: z.string().min(5).max(32),
  code: z.string().min(1).max(8),
})

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = Schema.parse(await request.json())
    const studioId = await getPublicStudioId(new URL(request.url).searchParams.get("studio"))

    // OTP required only when WhatsApp is on AND the studio kept it enabled.
    const enabled = await isStudioWhatsAppEnabled(studioId)
    const studio = enabled
      ? await prisma.studio.findUnique({ where: { id: studioId }, select: { requireBookingOtp: true } })
      : null
    const otpRequired = enabled && studio?.requireBookingOtp !== false

    // No code gate on this studio → nothing was PROVEN about number ownership,
    // so no details may be returned (this unauthenticated route would otherwise
    // let anyone enumerate name/email by phone on OTP-off studios). The widget
    // never calls verify in no-OTP mode, so nothing legitimate loses data.
    if (!otpRequired) {
      return NextResponse.json({ ok: true, client: null })
    }

    const res0 = await verifyBookingOtp({ studioId, phone, code })
    if (!res0.ok) {
      return NextResponse.json({ ok: false, error: res0.error, remaining: res0.remaining }, { status: 401 })
    }

    // Code proven → privacy-safe lookup of last-used details.
    const client = await getVerifiedClientDetails({ studioId, phone })

    // Remember the verified number on this device (signed httpOnly cookie, up to
    // 400 days, sliding): repeat bookings from the same device skip the code.
    const res = NextResponse.json({ ok: true, client })
    if (otpRequired) attachOtpSession(request, res, { phone, studioId })
    return res
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 })
    }
    console.error("[otp/verify] error:", err)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}
