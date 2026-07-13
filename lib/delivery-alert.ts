import { prisma } from "@/lib/prisma"
import { sendPush } from "@/lib/expo-push"
import { sendWebPush } from "@/lib/web-push"
import { elog } from "@/lib/elog"

// A client message that never arrives is the silent killer: the client simply
// doesn't know about their class (wrong number, number not on WhatsApp,
// template paused). Surface every such failure IMMEDIATELY to the studio's
// admins - as a push AND as a preview line on the conversation in the inbox -
// instead of waiting for someone to scroll the chat and spot "Not delivered".
// (Born from the Caroline case 13.07: a truncated number swallowed the booking
// confirmation and nobody knew until the owner noticed by eye.)
export async function notifyDeliveryFailure(opts: {
  studioId: string
  conversationId?: string | null
  clientName?: string | null
  clientPhone: string
  /** Meta's human-readable failure detail, if any. */
  detail?: string | null
}): Promise<void> {
  const who = opts.clientName?.trim() || `+${opts.clientPhone.replace(/\D/g, "")}`
  const title = "Message not delivered"
  const body = `${who} - WhatsApp message failed. Check the number.`

  // Badge in the inbox list: the same preview-line mechanism bookings use
  // (violet line under the chat, cleared when the chat is opened). No red
  // unread bump - that stays reserved for unanswered client messages.
  if (opts.conversationId) {
    try {
      await prisma.whatsAppConversation.update({
        where: { id: opts.conversationId },
        data: { bookingPreview: "! Not delivered - check the number" },
      })
    } catch {
      /* best-effort */
    }
  }

  try {
    const admins = await prisma.user.findMany({
      where: { studioId: opts.studioId, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      select: { id: true, chatNotifMode: true },
    })
    await Promise.all(
      admins.flatMap((u) => [
        sendPush({
          userId: u.id,
          title,
          body,
          category: "message",
          data: opts.conversationId ? { conversationId: opts.conversationId } : {},
          chatNotifMode:
            (u.chatNotifMode as "SOUND_VIBRATION" | "VIBRATION_ONLY" | "SOUND_ONLY") ??
            "SOUND_VIBRATION",
        }),
        sendWebPush({
          userId: u.id,
          title,
          body,
          data: opts.conversationId ? { conversationId: opts.conversationId } : {},
        }),
      ]),
    )
  } catch (err) {
    console.warn("[delivery-alert] push failed:", err)
  }

  void elog("delivery:failed", "client message not delivered", {
    studioId: opts.studioId,
    conversationId: opts.conversationId ?? null,
    clientPhone: opts.clientPhone,
    detail: opts.detail ?? null,
  })
}
