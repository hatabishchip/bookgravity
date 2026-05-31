import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { trainerHasAccess } from "@/lib/whatsapp-conversation"

// DELETE /api/whatsapp/messages/[id]
//
// Removes one of OUR sent messages from the inbox thread. Guarded to match the
// product rule: only outbound (our own) messages, and only while the client
// hasn't read it yet (status !== "read"). Note: WhatsApp's Cloud API has no
// recall/unsend, so this removes the message from our records — it can't pull
// it off the client's phone if it was already delivered.
export async function DELETE(
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
    return NextResponse.json({ error: "not_found", message: "Сообщение не найдено." }, { status: 404 })
  }

  if (ctx.role === "TRAINER") {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: ctx.userId, studioId: ctx.studioId },
      select: { id: true },
    })
    if (!trainer || !(await trainerHasAccess(message.conversation.id, trainer.id))) {
      return NextResponse.json({ error: "forbidden", message: "Нет доступа к этому чату." }, { status: 403 })
    }
  }

  if (message.direction !== "OUTBOUND") {
    return NextResponse.json(
      { error: "inbound", message: "Удалять можно только свои отправленные сообщения." },
      { status: 400 },
    )
  }
  if (message.status === "read") {
    return NextResponse.json(
      { error: "already_read", message: "Клиент уже прочитал — удаление недоступно." },
      { status: 400 },
    )
  }

  await prisma.whatsAppMessage.delete({ where: { id: message.id } })
  return NextResponse.json({ ok: true })
}
