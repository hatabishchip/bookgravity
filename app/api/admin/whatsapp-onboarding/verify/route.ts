// POST /api/admin/whatsapp-onboarding/verify
//
// Step 2 of the studio self-service WhatsApp activation flow. The admin
// types the 6-digit code from SMS; we:
//   1. Submit the code to Meta's /verify_code
//   2. Generate a 2FA PIN (or reuse the stored one) and call /register
//   3. Promote the request values into the real whatsapp* fields and flip
//      whatsappEnabled to true so the inbox + booking flow go live
//
// Body: { code: "123456" }
// Returns: { status: "active", phone: "+62 812 …" } | { error: "..." }

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  verifyCode,
  registerPhone,
  generateTwoFactorPin,
  getDefaultWabaId,
} from "@/lib/whatsapp-onboarding"

const Schema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Введи 6 цифр"),
})

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: {
      id: true,
      whatsappOnboardingEnabled: true,
      whatsappRequestPhoneNumberId: true,
      whatsappRequestDisplayPhone: true,
      whatsappRequestStatus: true,
      whatsappTwoFactorPin: true,
    },
  })
  if (!studio) {
    return NextResponse.json({ error: "Studio not found" }, { status: 404 })
  }
  if (!studio.whatsappOnboardingEnabled) {
    return NextResponse.json(
      { error: "Активация WhatsApp ещё не разрешена для этой студии." },
      { status: 403 },
    )
  }
  if (
    !studio.whatsappRequestPhoneNumberId ||
    studio.whatsappRequestStatus !== "code_sent"
  ) {
    return NextResponse.json(
      { error: "Нет активной заявки. Введи номер сначала." },
      { status: 409 },
    )
  }

  const parsed = Schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    )
  }

  await prisma.studio.update({
    where: { id: studio.id },
    data: { whatsappRequestStatus: "verifying" },
  })

  // 1. Verify the code with Meta.
  const verify = await verifyCode({
    phoneNumberId: studio.whatsappRequestPhoneNumberId,
    code: parsed.data.code,
  })
  if (!verify.ok) {
    await prisma.studio.update({
      where: { id: studio.id },
      data: {
        whatsappRequestStatus: "code_sent", // back to "enter code" so admin can retry
        whatsappRequestNote: verify.error.slice(0, 500),
      },
    })
    return NextResponse.json({ error: verify.error }, { status: 400 })
  }

  // 2. Register: generate or reuse the 2FA PIN, then POST /register.
  const pin = studio.whatsappTwoFactorPin || generateTwoFactorPin()
  const register = await registerPhone({
    phoneNumberId: studio.whatsappRequestPhoneNumberId,
    pin,
  })
  if (!register.ok) {
    await prisma.studio.update({
      where: { id: studio.id },
      data: {
        whatsappRequestStatus: "failed",
        whatsappRequestNote: register.error.slice(0, 500),
        whatsappTwoFactorPin: pin, // persist so we don't lose it if /register
                                    // succeeded server-side but we mis-read the
                                    // response.
      },
    })
    return NextResponse.json({ error: register.error }, { status: 502 })
  }

  // 3. Promote request fields → real whatsapp* fields. Flip enabled flag.
  // bookingAlertWhatsapp is kept in sync so the existing booking-copy
  // pipeline (bookings/route.ts) keeps working without changes — the
  // activated phone IS the admin's booking-copy phone now.
  const updated = await prisma.studio.update({
    where: { id: studio.id },
    data: {
      whatsappPhoneNumberId: studio.whatsappRequestPhoneNumberId,
      whatsappDisplayPhone: studio.whatsappRequestDisplayPhone,
      whatsappBusinessAccountId: getDefaultWabaId(),
      whatsappEnabled: true,
      whatsappConnectedAt: new Date(),
      whatsappTwoFactorPin: pin,
      whatsappRequestStatus: "active",
      whatsappRequestReviewedAt: new Date(),
      whatsappRequestNote: null,
      bookingAlertWhatsapp: studio.whatsappRequestDisplayPhone,
    },
    select: { whatsappDisplayPhone: true },
  })

  return NextResponse.json(
    { status: "active", phone: updated.whatsappDisplayPhone ?? null },
    { status: 200 },
  )
}
