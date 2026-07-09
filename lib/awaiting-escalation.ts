import { prisma } from "@/lib/prisma"
import { sendPush } from "@/lib/expo-push"
import { sendWebPush } from "@/lib/web-push"

// Awaiting-reply escalation (chat audit 09.07: median staff answer to a
// client question was 2.6h, every tenth waited 12h+, and 53 chats ended on an
// unanswered question). When a client message sits unanswered for 2 hours
// (unreadTrainer > 0 = nobody replied), the studio's admins get ONE push per
// stuck message. The dedupe marker includes lastInboundAt, so a NEW client
// message naturally re-arms the escalation, and an answer clears unreadTrainer
// so nothing fires. Piggybacks on the frequent today-reminders cron.
const ESCALATE_AFTER_MIN = 120

export async function runAwaitingEscalation(): Promise<{ checked: number; escalated: number }> {
  const cutoff = new Date(Date.now() - ESCALATE_AFTER_MIN * 60_000)
  const convos = await prisma.whatsAppConversation.findMany({
    where: { unreadTrainer: { gt: 0 }, lastInboundAt: { lt: cutoff } },
    select: { id: true, studioId: true, clientName: true, clientPhone: true, lastInboundAt: true },
  })

  let escalated = 0
  for (const c of convos) {
    if (!c.lastInboundAt) continue
    const marker = `${c.id}:${c.lastInboundAt.toISOString()}`
    const seen = await prisma.eventLog.findFirst({
      where: { scope: "inbox:escalation", message: marker },
      select: { id: true },
    })
    if (seen) continue

    const admins = await prisma.user.findMany({
      where: { studioId: c.studioId, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
      select: { id: true, chatNotifMode: true },
    })
    const hours = Math.max(2, Math.round((Date.now() - c.lastInboundAt.getTime()) / 3600_000))
    const title = `Awaiting reply ${hours}h`
    const body = `${c.clientName?.trim() || c.clientPhone} is still waiting for an answer`
    await Promise.all(
      admins.flatMap((u) => [
        sendPush({
          userId: u.id,
          title,
          body,
          category: "message",
          data: { conversationId: c.id },
          chatNotifMode:
            (u.chatNotifMode as "SOUND_VIBRATION" | "VIBRATION_ONLY" | "SOUND_ONLY") ?? "SOUND_VIBRATION",
        }).catch(() => {}),
        sendWebPush({ userId: u.id, title, body, data: { conversationId: c.id } }).catch(() => {}),
      ]),
    )
    await prisma.eventLog.create({
      data: { scope: "inbox:escalation", level: "info", message: marker, data: JSON.stringify({ hours }) },
    })
    escalated++
  }
  return { checked: convos.length, escalated }
}
