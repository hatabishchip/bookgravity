import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { trainerHasAccess } from "@/lib/whatsapp-conversation"
import { translateAndDetect } from "@/lib/translate"

// POST /api/whatsapp/messages/[id]/translate
//
// On-demand translation of a single message into the studio's configured
// inboxLanguage. Used by the inbox "translate" button so a viewer can render
// any client message in their language even when auto-translation is off or
// didn't run. Persists translatedBody + detectedLang so it sticks.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const message = await prisma.whatsAppMessage.findUnique({
    where: { id },
    include: { conversation: { select: { id: true, studioId: true } } },
  })
  if (!message || message.conversation.studioId !== ctx.studioId) {
    return NextResponse.json({ error: "not_found", message: "Message not found." }, { status: 404 })
  }

  // Trainers may only translate messages in chats they have access to.
  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || !(await trainerHasAccess(message.conversation.id, trainer.id))) {
      return NextResponse.json({ error: "forbidden", message: "No access to this chat." }, { status: 403 })
    }
  }

  if (!message.body || !message.body.trim()) {
    return NextResponse.json(
      { error: "nothing_to_translate", message: "No text to translate." },
      { status: 400 },
    )
  }

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { inboxLanguage: true },
  })
  const target = studio?.inboxLanguage
  if (!target) {
    return NextResponse.json(
      { error: "no_language", message: "Set the translation language in admin settings." },
      { status: 400 },
    )
  }

  const t = await translateAndDetect({ text: message.body, targetLang: target })
  if (!t.ok) {
    const message =
      t.error === "ANTHROPIC_API_KEY not set"
        ? "Translation isn't configured on the server (no ANTHROPIC_API_KEY)."
        : `Translation service unavailable: ${t.error}`
    console.error("[translate] failed:", t.error)
    return NextResponse.json({ error: t.error, message }, { status: 502 })
  }

  // If the message is already in the target language there's nothing to show —
  // store the detected lang and leave translatedBody null so the UI just notes
  // it's already in the admin's language.
  const sameLang = t.sourceLang === target
  const translatedBody = sameLang ? null : t.translated
  await prisma.whatsAppMessage.update({
    where: { id: message.id },
    data: {
      translatedBody,
      detectedLang: t.sourceLang,
      translatedVia: sameLang ? null : t.provider,
    },
  })

  return NextResponse.json({
    translatedBody,
    detectedLang: t.sourceLang,
    translatedVia: sameLang ? null : t.provider,
    alreadyInTarget: sameLang,
  })
}
