import { NextRequest, NextResponse } from "next/server"
import { del } from "@vercel/blob"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import {
  uploadMediaToMeta,
  sendWhatsAppMedia,
  sendWhatsAppText,
  sendWhatsAppTemplate,
  getConfigFor,
} from "@/lib/whatsapp-cloud"
import {
  appendOutboundMessage,
  isInsideCustomerWindow,
  markConversationHandled,
  trainerHasAccess,
} from "@/lib/whatsapp-conversation"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { driveConfigured, driveConnected, uploadClientMedia } from "@/lib/google-drive"

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

// What the client receives with their Drive folder link (trainer media
// bridge). Client-facing text - change only with the owner's sign-off.
const MEDIA_LINK_TEXT = "Here are your photos and videos from Gravity Stretching: {link}"

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

  // Trainer media goes over the GOOGLE DRIVE BRIDGE when connected (owner
  // 14.07): the original file lands in the owner's Drive and the client gets a
  // LINK - which is plain text, so unlike raw media it also works through a
  // CLOSED window (admin_message template). Window gating for the bridge
  // happens inside the branch below; only the direct-to-WhatsApp path (admin,
  // or trainer while Drive isn't connected) requires an open window.
  const useDriveBridge = ctx.role === "TRAINER" && driveConfigured() && driveConnected()

  // Free-form media follows the same 24h-window rule as text. (Outside the
  // window only approved templates with media headers work, which we don't
  // support yet.)
  if (!useDriveBridge && !isInsideCustomerWindow(convo.lastInboundAt)) {
    return NextResponse.json(
      { error: "window_closed", code: "window_closed" },
      { status: 409 },
    )
  }

  // Two input modes:
  //  - multipart form: small files posted straight to this function.
  //  - JSON { blobUrl, mime, filename, caption }: large files (video) the client
  //    first streamed to Vercel Blob to dodge the ~4.5 MB serverless body cap;
  //    we fetch the bytes here (a fetch response is NOT bound by that cap).
  const contentType = req.headers.get("content-type") || ""
  let buffer: Buffer
  let mimeType: string
  let fileName: string
  let caption: string | undefined
  let blobUrlToDelete: string | null = null

  if (contentType.includes("application/json")) {
    let j: { blobUrl?: string; mime?: string; filename?: string; caption?: string }
    try {
      j = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    if (!j.blobUrl) return NextResponse.json({ error: "blobUrl is required" }, { status: 400 })
    blobUrlToDelete = j.blobUrl
    const res = await fetch(j.blobUrl)
    if (!res.ok) {
      await del(j.blobUrl).catch(() => {})
      return NextResponse.json({ error: `Could not read the uploaded file (HTTP ${res.status})` }, { status: 400 })
    }
    buffer = Buffer.from(await res.arrayBuffer())
    mimeType = j.mime || res.headers.get("content-type") || "application/octet-stream"
    fileName = j.filename || "upload"
    caption = j.caption || undefined
  } else {
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 })
    }
    const file = form.get("file")
    caption = (form.get("caption") as string | null) || undefined
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 })
    }
    buffer = Buffer.from(await file.arrayBuffer())
    mimeType = file.type || "application/octet-stream"
    fileName = file.name || ""
  }

  const type = classifyMime(mimeType, fileName)
  // Drive has no WhatsApp-style per-type caps - only a sanity ceiling so a
  // giant file can't hang the function. The direct path keeps Meta's limits.
  const limit = useDriveBridge ? 100 * 1024 * 1024 : MAX_BYTES[type]
  if (buffer.length > limit) {
    if (blobUrlToDelete) await del(blobUrlToDelete).catch(() => {})
    return NextResponse.json(
      { error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds ${limit / 1024 / 1024}MB limit for ${type}` },
      { status: 413 },
    )
  }

  // This studio's own WhatsApp config (per-studio number; falls back to global).
  const studioWA = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { whatsappPhoneNumberId: true, whatsappAccessToken: true },
  })
  const waConfig = getConfigFor(studioWA)

  // ---------- Drive bridge (trainer) ----------
  if (useDriveBridge) {
    // Folder name: client name + last phone digits - stable, human, unique
    // enough ("Anna 4627"). Slashes stripped so it stays a single folder.
    const digits = convo.clientPhone.replace(/\D/g, "")
    const clientKey = `${(convo.clientName ?? "").replace(/[\\/]/g, " ").trim() || "Client"} ${digits.slice(-4)}`.trim()
    const up = await uploadClientMedia({
      clientKey,
      filename: fileName || `media-${Date.now()}.${type === "video" ? "mp4" : "jpg"}`,
      mimeType,
      bytes: buffer,
    })
    if (blobUrlToDelete) await del(blobUrlToDelete).catch(() => {})
    if (!up.ok) {
      return NextResponse.json({ error: `Drive upload failed: ${up.error}` }, { status: 502 })
    }

    // The client always gets the link to their whole FOLDER (they see all
    // their media in one place); the folder is shared view-only by link.
    const text = MEDIA_LINK_TEXT.replace("{link}", up.result.folderLink)
    const windowOpen = isInsideCustomerWindow(convo.lastInboundAt)
    let res: { ok: true; messageId: string } | { ok: false; error: string }
    let templateName: string | null = null
    if (windowOpen) {
      res = await sendWhatsAppText(convo.clientPhone, text, waConfig)
    } else {
      // Closed window -> approved admin_message template, same wrap as typed
      // staff text ({{1}} = first name, {{2}} = the message body).
      templateName = process.env.WHATSAPP_TEMPLATE_ADMIN_MESSAGE || "admin_message"
      const lang = process.env.WHATSAPP_TEMPLATE_LANG || "en"
      const clientFirstName = (convo.clientName ?? "").trim().split(/\s+/)[0] || "there"
      res = await sendWhatsAppTemplate({
        toPhone: convo.clientPhone,
        templateName,
        languageCode: lang,
        variables: [clientFirstName, text],
        config: waConfig,
      })
    }

    // Persist as a TEXT-ish row whose body carries the link - the inbox
    // linkifies it, so the trainer sees and can re-open the same folder.
    const saved = await appendOutboundMessage({
      conversationId: convo.id,
      type: windowOpen ? "text" : "template",
      body: text,
      templateName,
      waMessageId: res.ok ? res.messageId : null,
      status: res.ok ? "sent" : "failed",
      errorDetail: res.ok ? null : res.error,
      fromTrainerId,
    })
    if (res.ok) await markConversationHandled(convo.id)
    return NextResponse.json(
      { message: saved, sendResult: res, ...(res.ok ? {} : { error: res.error }) },
      { status: res.ok ? 201 : 502 },
    )
  }

  // 1. Upload bytes to Meta to get a media_id (on this studio's WABA).
  const upload = await uploadMediaToMeta(buffer, mimeType, fileName || `upload.${type}`, waConfig)
  if (!upload.ok) {
    if (blobUrlToDelete) await del(blobUrlToDelete).catch(() => {})
    return NextResponse.json({ error: upload.error }, { status: 502 })
  }
  // The bytes are now on Meta; the temporary blob (if any) is no longer needed.
  if (blobUrlToDelete) await del(blobUrlToDelete).catch(() => {})

  // 2. Send the message referencing that media_id.
  const send = await sendWhatsAppMedia({
    toPhone: convo.clientPhone,
    type,
    mediaId: upload.id,
    caption,
    filename: type === "document" ? fileName || undefined : undefined,
    config: waConfig,
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
    {
      message: patched,
      sendResult: send,
      // Surface the real reason on the bubble when Meta accepted the upload but
      // rejected the send, instead of a bare "HTTP 502".
      ...(send.ok ? {} : { error: send.error }),
    },
    { status: send.ok ? 201 : 502 },
  )
}

// Allow large multipart uploads. By default Next.js streams the body, but
// some hosting envs cap at 4MB unless explicitly opted out.
export const runtime = "nodejs"
export const maxDuration = 60
