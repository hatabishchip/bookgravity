import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { fetchMetaMedia } from "@/lib/whatsapp-cloud"
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
    include: { conversation: { select: { studioId: true, assignedTrainerId: true } } },
  })
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (msg.conversation.studioId !== ctx.studioId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || msg.conversation.assignedTrainerId !== trainer.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  if (!msg.mediaUrl) {
    return NextResponse.json({ error: "No media on this message" }, { status: 404 })
  }

  const fetched = await fetchMetaMedia(msg.mediaUrl)
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
