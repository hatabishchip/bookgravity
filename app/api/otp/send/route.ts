import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { getConfigFor } from "@/lib/whatsapp-cloud"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { sendBookingOtp } from "@/lib/otp"
import { hasOtpSession } from "@/lib/otp-session"
import { rateLimit, clientIp } from "@/lib/rate-limit"

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

    // Abuse brakes (audit 2026-06-12): spraying codes burns the Meta quota
    // and the WhatsApp number's quality rating.
    // 15/hr per IP: a studio's clients often book from one shared wifi (one IP),
    // so keep headroom above the old 8 to avoid locking out real clients. The
    // per-phone 10/day cap below is the tighter anti-spam brake.
    const ipRl = await rateLimit({ scope: "otp-ip", subject: clientIp(request), limit: 15, windowSec: 3600 })
    const phoneRl = await rateLimit({ scope: "otp-phone", subject: data.phone.replace(/\D/g, ""), limit: 10, windowSec: 86400 })
    if (!ipRl.ok || !phoneRl.ok) {
      const retry = !ipRl.ok ? ipRl.retryAfterSec : (!phoneRl.ok ? phoneRl.retryAfterSec : 60)
      return NextResponse.json(
        { error: "Too many code requests - please try again later.", code: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(retry) } },
      )
    }

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
        { error: "A code was just sent - please wait a moment before requesting another.", code: "too_soon", retryInSec: res.retryInSec },
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
