import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { getMembershipBalance } from "@/lib/membership"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { verifyBookingOtp } from "@/lib/otp"

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

    if (otpRequired) {
      const res = await verifyBookingOtp({ studioId, phone, code })
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error, remaining: res.remaining }, { status: 401 })
      }
    }

    // Verified (or OTP not required) → privacy-safe lookup of last-used details.
    // Scope to THIS studio (via slot.studioId): the same phone may have booked
    // at another studio, and one studio must never surface a name/email the
    // client only ever gave to a different studio.
    const [nameBooking, emailBooking] = await Promise.all([
      prisma.booking.findFirst({
        where: { clientPhone: phone, slot: { studioId } },
        orderBy: { createdAt: "desc" },
        select: { clientName: true },
      }),
      prisma.booking.findFirst({
        where: { clientPhone: phone, clientEmail: { not: "" }, slot: { studioId } },
        orderBy: { createdAt: "desc" },
        select: { clientEmail: true },
      }),
    ])
    const cleanName = nameBooking?.clientName?.replace(/\s*\(\d+\/\d+\)$/, "").trim() || null
    let membershipRemaining = 0
    if (phone.replace(/\D/g, "").slice(-10).length >= 6) {
      membershipRemaining = await getMembershipBalance(studioId, phone)
    }

    return NextResponse.json({
      ok: true,
      client: { name: cleanName, email: emailBooking?.clientEmail ?? null, membershipRemaining },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 })
    }
    console.error("[otp/verify] error:", err)
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 })
  }
}
