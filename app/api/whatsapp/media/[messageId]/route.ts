import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { fetchMetaMedia, getConfigFor } from "@/lib/whatsapp-cloud"
import { trainerHasAccess } from "@/lib/whatsapp-conversation"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"

// GET /api/whatsapp/media/[messageId]
//
// Streams the media bytes for a WhatsApp message — works for both inbound
// (client → us) and outbound (us → client) media. Meta's signed media URL
// expires within minutes, so we look it up fresh per request and serve the
// content from our endpoint with HTTP caching. The browser caches the
// response so repeated views of the same message don't re-download.
//
// Permission: admin sees any message in their studio, trainer only the
// ones in conversations assigned to them.

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isStudioWhatsAppEnabled(ctx.studioId))) {
    return NextResponse.json({ error: "WhatsApp not enabled for this studio" }, { status: 403 })
  }

  const { messageId } = await params
  const msg = await prisma.whatsAppMessage.findFirst({
    where: { id: messageId },
    include: {
      conversation: {
        select: {
          id: true,
          studioId: true,
          studio: { select: { whatsappPhoneNumberId: true, whatsappAccessToken: true } },
        },
      },
    },
  })
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (msg.conversation.studioId !== ctx.studioId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (ctx.role === "TRAINER") {
    // Access is granted per-conversation (multi-trainer), not just to the single
    // assignedTrainer — match the send route so any trainer who can see the chat
    // can also load its media.
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || !(await trainerHasAccess(msg.conversation.id, trainer.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  if (!msg.mediaUrl) {
    return NextResponse.json({ error: "No media on this message" }, { status: 404 })
  }

  // Resolve the media_id with THIS studio's WhatsApp config (it was uploaded /
  // received on the studio's own WABA). Using the global token would 403.
  const waConfig = getConfigFor(msg.conversation.studio)
  const fetched = await fetchMetaMedia(msg.mediaUrl, waConfig)
  if (!fetched.ok) {
    return NextResponse.json({ error: fetched.error }, { status: 502 })
  }

  return new NextResponse(fetched.bytes, {
    status: 200,
    headers: {
      "Content-Type": fetched.mimeType || msg.mediaMime || "application/octet-stream",
      // Browser may cache aggressively — message media is immutable.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  })
}
