import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { checkWhatsAppHealth } from "@/lib/whatsapp-cloud"

export const dynamic = "force-dynamic"

// POST /api/sadmin/whatsapp-health  { studioId }
// Super-admin only. Does a live round-trip to Meta to confirm the studio's
// WhatsApp credentials actually work right now, and returns the latest
// outbound message timestamp from our records.
export async function POST(request: NextRequest) {
  const ctx = await requireSuperAdmin()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let studioId: string
  try {
    studioId = (await request.json()).studioId
    if (!studioId) throw new Error()
  } catch {
    return NextResponse.json({ error: "studioId required" }, { status: 400 })
  }

  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { whatsappPhoneNumberId: true, whatsappAccessToken: true },
  })
  if (!studio) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const health = await checkWhatsAppHealth(studio)

  const lastOutbound = await prisma.whatsAppMessage.findFirst({
    where: { direction: "OUTBOUND", conversation: { studioId } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, status: true },
  })

  return NextResponse.json({
    health,
    lastOutboundAt: lastOutbound?.createdAt ?? null,
    lastOutboundStatus: lastOutbound?.status ?? null,
  })
}
