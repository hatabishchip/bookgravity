// POST /api/admin/whatsapp-onboarding/cancel
//
// Clear in-progress onboarding state so the admin can start over. We do
// NOT delete the phone from the WABA — Meta keeps it as unverified, and
// if the admin re-submits the same number we'll just request a fresh
// code against the same phone_number_id.
//
// Body: {}
// Returns: { status: "idle" }

import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function POST() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await prisma.studio.update({
    where: { id: ctx.studioId },
    data: {
      whatsappRequestPhoneNumberId: null,
      whatsappRequestDisplayPhone: null,
      whatsappRequestStatus: null,
      whatsappRequestedAt: null,
      whatsappRequestReviewedAt: null,
      whatsappRequestNote: null,
    },
  })
  return NextResponse.json({ status: "idle" })
}
