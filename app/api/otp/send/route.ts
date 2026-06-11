import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { getConfigFor } from "@/lib/whatsapp-cloud"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { sendBookingOtp } from "@/lib/otp"
import { hasOtpSession } from "@/lib/otp-session"

// POST /api/otp/send  body: { phone, name? }  query: ?studio=<slug>
// Sends a 2-digit WhatsApp confirmation code the client must enter before the
// booking is created. Studios without WhatsApp fall back to no-OTP booking
// (skipped:true) so we never lock anyone out.
const Schema = z.object({
  phone: z.string().min(5).max(32),
  name: z.string().max(120).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const data = Schema.parse(await request.json())
    const studioId = await getPublicStudioId(new URL(request.url).searchParams.get("studio"))

    // No WhatsApp for this studio → skip OTP entirely (booking proceeds as before).
    if (!(await isStudioWhatsAppEnabled(studioId))) {
      return NextResponse.json({ skipped: true })
    }

    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { whatsappPhoneNumberId: true, whatsappAccessToken: true, requireBookingOtp: true },
    })
    // Admin turned the confirmation off for this studio → no code required.
    if (studio && studio.requireBookingOtp === false) {
      return NextResponse.json({ skipped: true })
    }
    const config = getConfigFor(studio)
    if (!config) return NextResponse.json({ skipped: true })

    // Verified this number in the last 2h (signed cookie)? Skip the code —
    // the widget treats skipped like the no-OTP flow and books directly; the
    // booking POST accepts the same session in place of a code.
    if (hasOtpSession(request, { phone: data.phone, studioId })) {
      return NextResponse.json({ skipped: true, session: true })
    }

    const res = await sendBookingOtp({ studioId, phone: data.phone, name: data.name, config })
    if (res.ok) return NextResponse.json({ sent: true })

    if (res.error === "too_soon") {
      return NextResponse.json(
        { error: "A code was just sent — please wait a moment before requesting another.", code: "too_soon", retryInSec: res.retryInSec },
        { status: 429 },
      )
    }
    return NextResponse.json(
      { error: "Couldn't send the code to that WhatsApp number. Check it and try again.", code: "send_failed" },
      { status: 502 },
    )
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 })
    }
    console.error("[otp/send] error:", err)
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
  }
}
