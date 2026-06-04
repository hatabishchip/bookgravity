import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { upsertConversation } from "@/lib/whatsapp-conversation"
import { phoneTail } from "@/lib/membership"

// POST /api/whatsapp/conversations/resolve  { phone, name? } -> { id }
// Resolve the in-app conversation for a client by phone so the booking /
// schedule screens can open the internal chat ("Open chat"). Matches by phone
// tail (conversations may be stored in Meta's digit format from inbound
// webhooks while bookings store a formatted number). Creates an empty
// conversation if none exists yet so the chat can still open.
export async function POST(req: NextRequest) {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isStudioWhatsAppEnabled(ctx.studioId))) {
    return NextResponse.json({ error: "WhatsApp not enabled for this studio" }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { phone?: string; name?: string }
  const phone = (body.phone || "").trim()
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 })
  const tail = phoneTail(phone)
  if (!tail) return NextResponse.json({ error: "invalid phone" }, { status: 400 })

  const convos = await prisma.whatsAppConversation.findMany({
    where: { studioId: ctx.studioId },
    select: { id: true, clientPhone: true },
  })
  const match = convos.find((c) => phoneTail(c.clientPhone) === tail)
  if (match) return NextResponse.json({ id: match.id })

  const convo = await upsertConversation({
    studioId: ctx.studioId,
    clientPhone: phone,
    clientName: body.name ?? null,
  })
  return NextResponse.json({ id: convo.id })
}
