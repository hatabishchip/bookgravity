import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import {
  uploadMediaToMeta,
  sendWhatsAppMedia,
} from "@/lib/whatsapp-cloud"
import {
  appendOutboundMessage,
  isInsideCustomerWindow,
  trainerHasAccess,
} from "@/lib/whatsapp-conversation"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"

// POST /api/whatsapp/conversations/[id]/media
// multipart/form-data: file (required), caption (optional)
//
// Uploads the file to Meta, sends it via WhatsApp Cloud API, and persists
// the outbound message. Returns the saved message row.

// Meta upper limits per category (we trust client-side, but defend server-
// side too so a giant file doesn't hang the function).
const MAX_BYTES = {
  image: 5 * 1024 * 1024, // 5 MB
  video: 16 * 1024 * 1024, // 16 MB
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
  // Stickers: 100 KB static / 500 KB animated. We accept up to 500 KB.
  sticker: 500 * 1024,
} as const

function classifyMime(mime: string, filename: string): "image" | "video" | "audio" | "document" | "sticker" {
  // WhatsApp distinguishes sticker (webp, square, ≤500KB) from regular
  // image. If the user picks a .webp from their library or drag-drops a
  // sticker exported from another chat, send it as a sticker so it shows
  // up native-style on the recipient side.
  if (mime === "image/webp" || /\.webp$/i.test(filename)) return "sticker"
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  return "document"
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isStudioWhatsAppEnabled(ctx.studioId))) {
    return NextResponse.json({ error: "WhatsApp not enabled for this studio" }, { status: 403 })
  }

  const { id } = await params
  const convo = await prisma.whatsAppConversation.findFirst({
    where: { id, studioId: ctx.studioId },
  })
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Permission: trainer can send into a chat they have access to (booking-granted).
  let fromTrainerId: string | null = null
  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || !(await trainerHasAccess(convo.id, trainer.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    fromTrainerId = trainer.id
  }

  // Free-form media follows the same 24h-window rule as text. (Outside the
  // window only approved templates with media headers work, which we don't
  // support yet.)
  if (!isInsideCustomerWindow(convo.lastInboundAt)) {
    return NextResponse.json(
      { error: "window_closed", code: "window_closed" },
      { status: 409 },
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 })
  }
  const file = form.get("file")
  const caption = (form.get("caption") as string | null) || undefined
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 })
  }

  const mimeType = file.type || "application/octet-stream"
  const type = classifyMime(mimeType, file.name || "")
  const limit = MAX_BYTES[type]
  if (file.size > limit) {
    return NextResponse.json(
      { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds ${limit / 1024 / 1024}MB limit for ${type}` },
      { status: 413 },
    )
  }

  // 1. Upload bytes to Meta to get a media_id.
  const buffer = Buffer.from(await file.arrayBuffer())
  const upload = await uploadMediaToMeta(buffer, mimeType, file.name || `upload.${type}`)
  if (!upload.ok) {
    return NextResponse.json({ error: upload.error }, { status: 502 })
  }

  // 2. Send the message referencing that media_id.
  const send = await sendWhatsAppMedia({
    toPhone: convo.clientPhone,
    type,
    mediaId: upload.id,
    caption,
    filename: type === "document" ? file.name || undefined : undefined,
  })

  // 3. Persist the outbound message — store media_id in mediaUrl so the
  //    /api/whatsapp/media/[messageId] proxy can later resolve it for the UI.
  const saved = await appendOutboundMessage({
    conversationId: convo.id,
    type,
    body: caption ?? null,
    waMessageId: send.ok ? send.messageId : null,
    status: send.ok ? "sent" : "failed",
    errorDetail: send.ok ? null : send.error,
    fromTrainerId,
  })
  // appendOutboundMessage doesn't take mediaUrl yet (text-only helper), so
  // patch the row separately to store media_id + mime for later display.
  const patched = await prisma.whatsAppMessage.update({
    where: { id: saved.id },
    data: { mediaUrl: upload.id, mediaMime: mimeType },
  })

  return NextResponse.json(
    { message: patched, sendResult: send },
    { status: send.ok ? 201 : 502 },
  )
}

// Allow large multipart uploads. By default Next.js streams the body, but
// some hosting envs cap at 4MB unless explicitly opted out.
export const runtime = "nodejs"
export const maxDuration = 60
