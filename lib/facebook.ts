// Facebook Messenger channel for the sales agent (owner 16.07.2026).
//
// The studio FB page (Gravity Stretching Canggu) is polled by the
// agent-autopilot sweep: Messenger threads are mirrored into the SAME conversation
// tables the WhatsApp inbox uses (clientPhone = "fb:<psid>"), so the agent
// pipeline, RU journal, lessons, stats and the staff inbox all work unchanged.
// Sending branches on the "fb:" prefix.
//
// Token: FB_PAGE_MESSAGING_TOKEN env - a page access token derived from the
// system-user token (does not expire). Until the system user gets the
// pages_messaging scope this module silently no-ops.
import { prisma } from "@/lib/prisma"

const FB_GRAPH = "https://graph.facebook.com/v21.0"
export const FB_PHONE_PREFIX = "fb:"

export function isFbConversationPhone(phone: string): boolean {
  return phone.startsWith(FB_PHONE_PREFIX)
}

/** Page access token with pages_messaging (env; system-user derived, permanent). */
export function getFbPageToken(): string | null {
  return process.env.FB_PAGE_MESSAGING_TOKEN || null
}

export type FbMessage = { id: string; fromId: string; fromUsername: string; text: string; createdTime: string }
export type FbThread = { peerId: string; peerUsername: string; messages: FbMessage[] }

/** Recent DM threads with their last messages (newest first inside). */
export async function fetchFbThreads(token: string, pageId: string): Promise<FbThread[]> {
  const url = `${FB_GRAPH}/${pageId}/conversations?fields=participants,messages.limit(10)%7Bid,from,message,created_time%7D&limit=25&access_token=${token}`
  const r = await fetch(url)
  if (!r.ok) {
    const errText = (await r.text()).slice(0, 200)
    console.warn("[facebook] conversations fetch failed:", r.status, errText)
    try {
      const { elogError } = await import("@/lib/elog")
      void elogError("fb:sync", `conversations fetch failed HTTP ${r.status}`, { error: errText })
    } catch {}
    return []
  }
  const j = (await r.json()) as {
    data?: {
      participants?: { data?: { name?: string; username?: string; id?: string }[] }
      messages?: { data?: { id: string; from?: { username?: string; id?: string }; message?: string; created_time?: string }[] }
    }[]
  }
  const threads: FbThread[] = []
  for (const c of j.data ?? []) {
    const peer = (c.participants?.data ?? []).find((p) => p.id && p.id !== pageId)
    if (!peer?.id) continue
    // Keep attachment-only messages (stickers, photos, shares arrive with an
    // empty `message`) - same blindness fix as the IG channel (owner 23.07).
    const messages = (c.messages?.data ?? [])
      .filter((m) => !!m.id)
      .map((m) => ({
        id: m.id,
        fromId: m.from?.id ?? "",
        fromUsername: m.from?.username ?? "",
        text: m.message ?? "",
        createdTime: m.created_time ?? "",
      }))
    threads.push({ peerId: peer.id, peerUsername: (peer as { name?: string; username?: string }).name ?? peer.username ?? peer.id, messages })
  }
  return threads
}

/** Send a Messenger reply. Works within Facebook's 24h messaging window. */
export async function sendFacebookText(
  peerPsid: string,
  text: string,
  token: string,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${FB_GRAPH}/me/messages?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: peerPsid }, messaging_type: "RESPONSE", message: { text } }),
    })
    const j = (await r.json()) as { message_id?: string; error?: { message?: string } }
    if (r.ok && j.message_id) return { ok: true, messageId: j.message_id }
    return { ok: false, error: j.error?.message ?? `HTTP ${r.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Mirror recent Messenger threads into the WhatsApp conversation tables so the
 * whole existing pipeline (agent, journal, inbox) picks them up. Returns how
 * many new inbound messages were imported.
 */
export async function syncFacebookThreads(studioId: string): Promise<number> {
  const pageId = process.env.FB_PAGE_ID || "1143653658821911"
  const token = getFbPageToken()
  if (!token) return 0
  const threads = await fetchFbThreads(token, pageId)
  let imported = 0
  for (const t of threads) {
    if (!t.messages.length) continue
    const phone = FB_PHONE_PREFIX + t.peerId
    try {
      let convo = await prisma.whatsAppConversation.findFirst({
        where: { studioId, clientPhone: phone },
        select: { id: true },
      })
      if (!convo) {
        convo = await prisma.whatsAppConversation.create({
          data: { studioId, clientPhone: phone, clientName: "FB " + t.peerUsername },
          select: { id: true },
        })
      }
      // Oldest first so timestamps line up.
      for (const m of [...t.messages].reverse()) {
        const inbound = m.fromId !== pageId
        const at = m.createdTime ? new Date(m.createdTime) : new Date()
        // Attachment-only: import fresh ones with a placeholder, skip stale
        // ones (same rule as the IG sync).
        if (!m.text && Date.now() - at.getTime() > 10 * 24 * 3600 * 1000) continue
        const exists = await prisma.whatsAppMessage.findFirst({
          where: { waMessageId: m.id },
          select: { id: true },
        })
        if (exists) continue
        await prisma.whatsAppMessage.create({
          data: {
            conversationId: convo.id,
            direction: inbound ? "INBOUND" : "OUTBOUND",
            type: m.text ? "text" : "media",
            body: m.text || "[attachment]",
            waMessageId: m.id,
            status: inbound ? "delivered" : "sent",
            createdAt: at,
          },
        })
        if (inbound) {
          imported++
          // Language detect on the client's text (audit 25.07): without it the
          // sweep saw clientLanguage NULL for every IG/FB thread and answered
          // Indonesians/Russians in English. Best-effort, first text only.
          if (m.text && m.text.trim().length > 2) {
            try {
              const { translateAndDetect } = await import("@/lib/translate")
              const d = await translateAndDetect({ text: m.text, targetLang: "en" })
              if (d.ok && d.sourceLang && d.sourceLang !== "und") {
                await prisma.whatsAppConversation.update({
                  where: { id: convo.id },
                  data: { clientLanguage: d.sourceLang },
                })
              }
            } catch {}
          }
          await prisma.whatsAppConversation.update({
            where: { id: convo.id },
            data: {
              lastInboundAt: at,
              lastMessageAt: at,
              unreadAdmin: { increment: 1 },
              unreadTrainer: { increment: 1 },
            },
          })
        } else {
          await prisma.whatsAppConversation.update({
            where: { id: convo.id },
            data: { lastMessageAt: at },
          })
        }
      }
    } catch (err) {
      console.warn("[facebook] sync thread failed:", t.peerUsername, err)
    }
  }
  return imported
}
