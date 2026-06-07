// POST /api/admin/whatsapp-onboarding/submit
//
// Step 1 of the studio self-service WhatsApp activation flow. The admin
// types a phone number; we:
//   1. Add it to the studio's WABA via Meta API → get a phone_number_id
//   2. Trigger Meta to send a 6-digit code via SMS
//   3. Persist the in-progress state on the Studio row
// The endpoint returns quickly so the UI can flip to "Enter code" mode.
//
// Body: { phone: "+62 812 3456 789", displayName: "Gravity Stretching Bali" }
// Returns: { status: "code_sent" } | { error: "..." }

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import {
  addPhoneToWaba,
  requestVerificationCode,
  splitCountryAndNumber,
} from "@/lib/whatsapp-onboarding"

const Schema = z.object({
  phone: z.string().trim().min(7).max(32),
  displayName: z.string().trim().min(2).max(64),
})

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: {
      id: true,
      whatsappOnboardingEnabled: true,
      whatsappEnabled: true,
      whatsappPhoneNumberId: true,
      whatsappRequestStatus: true,
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
  if (studio.whatsappEnabled && studio.whatsappPhoneNumberId) {
    return NextResponse.json(
      { error: "WhatsApp уже активен для этой студии." },
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

  const split = splitCountryAndNumber(parsed.data.phone)
  if (!split) {
    return NextResponse.json(
      { error: "Не удалось разобрать номер. Пиши с кодом страны, например +62 812 3456 789." },
      { status: 400 },
    )
  }

  // 1. Add the phone to the WABA. Meta returns a fresh phone_number_id.
  const added = await addPhoneToWaba({
    countryCode: split.cc,
    phoneNumber: split.phoneNumber,
    verifiedName: parsed.data.displayName,
  })
  if (!added.ok) {
    await prisma.studio.update({
      where: { id: studio.id },
      data: {
        whatsappRequestStatus: "failed",
        whatsappRequestNote: added.error.slice(0, 500),
      },
    })
    return NextResponse.json({ error: added.error }, { status: 502 })
  }

  // 2. Trigger SMS verification.
  const codeReq = await requestVerificationCode({
    phoneNumberId: added.phoneNumberId,
    method: "SMS",
    language: "en",
  })
  // Persist either way — we have a phone_number_id we want to remember
  // even if the code-request hiccups, so the UI can offer "resend".
  await prisma.studio.update({
    where: { id: studio.id },
    data: {
      whatsappRequestPhoneNumberId: added.phoneNumberId,
      whatsappRequestDisplayPhone: `+${split.cc} ${split.phoneNumber}`,
      whatsappRequestStatus: codeReq.ok ? "code_sent" : "failed",
      whatsappRequestedAt: new Date(),
      whatsappRequestReviewedAt: null,
      whatsappRequestNote: codeReq.ok ? null : codeReq.error.slice(0, 500),
    },
  })

  if (!codeReq.ok) {
    return NextResponse.json({ error: codeReq.error }, { status: 502 })
  }
  return NextResponse.json({ status: "code_sent" }, { status: 201 })
}
