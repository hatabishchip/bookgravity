import { NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { trainerHasAccess } from "@/lib/whatsapp-conversation"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"

// POST /api/whatsapp/conversations/[id]/blob-upload
//
// Client-upload token endpoint for large media (video). Vercel serverless
// functions cap the REQUEST body at ~4.5 MB, so a phone video never reaches the
// regular /media route. Instead the browser uploads the file straight to Vercel
// Blob (no size limit) using a short-lived token minted here, then hands the
// resulting blob URL to /media, which fetches the bytes server-side (a fetch
// response is NOT bound by the request-body cap) and forwards them to WhatsApp.
//
// We authorize the same way as the /media route so a token is only issued to
// someone who may actually post into this conversation.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isStudioWhatsAppEnabled(ctx.studioId))) {
    return NextResponse.json({ error: "WhatsApp not enabled for this studio" }, { status: 403 })
  }

  const convo = await prisma.whatsAppConversation.findFirst({ where: { id, studioId: ctx.studioId } })
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || !(await trainerHasAccess(convo.id, trainer.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const body = (await req.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        // WhatsApp video/image caps; the regular /media route enforces them too.
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/3gpp", "video/quicktime"],
        maximumSizeInBytes: 16 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      // The actual WhatsApp send happens in /media once the client posts the
      // blob URL, so nothing to do on completion. (This webhook only fires in
      // production where the callback URL is publicly reachable.)
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "upload failed" }, { status: 400 })
  }
}
