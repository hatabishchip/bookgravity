// Instagram DM channel for the sales agent (owner 16.07.2026).
//
// The studio IG (@gravitystretchcanggu, Instagram Login API) is polled by the
// agent-autopilot sweep: DM threads are mirrored into the SAME conversation
// tables the WhatsApp inbox uses (clientPhone = "ig:<igsid>"), so the agent
// pipeline, RU journal, lessons, stats and the staff inbox all work unchanged.
// Sending branches on the "ig:" prefix.
//
// Token: long-lived (~60 days). The sweep refreshes it weekly via
// /refresh_access_token and stores the newest value in EventLog scope
// "ig:token" - env INSTAGRAM_ACCESS_TOKEN is only the seed/fallback.
import { prisma } from "@/lib/prisma"

const IG_GRAPH = "https://graph.instagram.com/v21.0"
export const IG_PHONE_PREFIX = "ig:"

export function isIgConversationPhone(phone: string): boolean {
  return phone.startsWith(IG_PHONE_PREFIX)
}

/** Newest stored token (EventLog beats env seed). */
export async function getIgToken(): Promise<string | null> {
  try {
    const row = await prisma.eventLog.findFirst({
      where: { scope: "ig:token" },
      orderBy: { createdAt: "desc" },
      select: { message: true },
    })
    if (row?.message?.startsWith("IGAA")) return row.message
  } catch {}
  return process.env.INSTAGRAM_ACCESS_TOKEN || null
}

/** Weekly refresh keeps the 60-day token alive forever. Safe to call every
 *  sweep - it no-ops unless the last refresh is >7 days old. */
export async function maybeRefreshIgToken(): Promise<void> {
  try {
    const last = await prisma.eventLog.findFirst({
      where: { scope: "ig:token" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })
    if (last && Date.now() - last.createdAt.getTime() < 7 * 24 * 3600 * 1000) return
    const token = await getIgToken()
    if (!token) return
    const r = await fetch(`${IG_GRAPH.replace("/v21.0", "")}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`)
    const j = (await r.json()) as { access_token?: string; error?: { message?: string } }
    if (r.ok && j.access_token) {
      await prisma.eventLog.create({
        data: { scope: "ig:token", level: "info", message: j.access_token, data: JSON.stringify({ refreshedAt: new Date().toISOString() }) },
      })
    } else {
      // A refresh that keeps failing means the 60-day token will die silently
      // - make it visible in the journal long before that.
      await prisma.eventLog.create({
        data: { scope: "ig:sync", level: "warn", message: "token refresh failed", data: JSON.stringify({ status: r.status, error: j.error?.message ?? null }) },
      })
    }
  } catch (err) {
    console.warn("[instagram] token refresh failed:", err)
  }
}

export type IgMessage = { id: string; fromId: string; fromUsername: string; text: string; createdTime: string }
export type IgThread = { peerId: string; peerUsername: string; messages: IgMessage[] }

/** Recent DM threads with their last messages (newest first inside). */
export async function fetchIgThreads(token: string, selfId: string): Promise<IgThread[]> {
  const url = `${IG_GRAPH}/me/conversations?fields=participants,messages.limit(10)%7Bid,from,message,created_time%7D&limit=25&access_token=${token}`
  const r = await fetch(url)
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 200)
    console.warn("[instagram] conversations fetch failed:", r.status, detail)
    // Surface in EventLog too - a silently dying token looked like "no new
    // messages" from the outside (owner 23.07).
    try {
      await prisma.eventLog.create({
        data: { scope: "ig:sync", level: "warn", message: `conversations fetch failed: HTTP ${r.status}`, data: detail },
      })
    } catch {}
    return []
  }
  const j = (await r.json()) as {
    data?: {
      participants?: { data?: { username?: string; id?: string }[] }
      messages?: { data?: { id: string; from?: { username?: string; id?: string }; message?: string; created_time?: string }[] }
    }[]
  }
  const threads: IgThread[] = []
  for (const c of j.data ?? []) {
    const peer = (c.participants?.data ?? []).find((p) => p.id && p.id !== selfId)
    if (!peer?.id) continue
    // Keep attachment-only messages too (story replies, reels, photos, voice
    // come through with an empty `message`) - dropping them made the agent
    // blind to real clients (owner 23.07: 4 unanswered IG chats). The sync
    // below imports them with an "[attachment]" placeholder body.
    const messages = (c.messages?.data ?? [])
      .filter((m) => !!m.id)
      .map((m) => ({
        id: m.id,
        fromId: m.from?.id ?? "",
        fromUsername: m.from?.username ?? "",
        text: m.message ?? "",
        createdTime: m.created_time ?? "",
      }))
    threads.push({ peerId: peer.id, peerUsername: peer.username ?? peer.id, messages })
  }
  return threads
}

/** Send a DM text reply. Works within Instagram's 24h messaging window;
 *  pass tag "HUMAN_AGENT" to reach the extended 7-day window. */
export async function sendInstagramText(
  peerIgsid: string,
  text: string,
  token: string,
  tag?: "HUMAN_AGENT",
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  try {
    const payload: Record<string, unknown> = { recipient: { id: peerIgsid }, message: { text } }
    if (tag) {
      payload.messaging_type = "MESSAGE_TAG"
      payload.tag = tag
    }
    const r = await fetch(`${IG_GRAPH}/me/messages?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const j = (await r.json()) as { message_id?: string; error?: { message?: string } }
    if (r.ok && j.message_id) return { ok: true, messageId: j.message_id }
    return { ok: false, error: j.error?.message ?? `HTTP ${r.status}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Mirror recent IG DM threads into the WhatsApp conversation tables so the
 * whole existing pipeline (agent, journal, inbox) picks them up. Returns how
 * many new inbound messages were imported.
 */
export async function syncInstagramThreads(studioId: string): Promise<number> {
  const selfId = process.env.IG_SELF_ID || "17841425426772959"
  const token = await getIgToken()
  if (!token) return 0
  await maybeRefreshIgToken()
  const threads = await fetchIgThreads(token, selfId)
  let imported = 0
  for (const t of threads) {
    if (!t.messages.length) continue
    const phone = IG_PHONE_PREFIX + t.peerId
    try {
      let convo = await prisma.whatsAppConversation.findFirst({
        where: { studioId, clientPhone: phone },
        select: { id: true },
      })
      if (!convo) {
        convo = await prisma.whatsAppConversation.create({
          data: { studioId, clientPhone: phone, clientName: "IG @" + t.peerUsername },
          select: { id: true },
        })
      }
      // Oldest first so timestamps line up.
      for (const m of [...t.messages].reverse()) {
        const inbound = m.fromId !== selfId
        const at = m.createdTime ? new Date(m.createdTime) : new Date()
        // Attachment-only (no text): import fresh ones with a placeholder so
        // the agent can greet and ask; skip stale ones - they'd only flood
        // the inbox with months-old unread rows.
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
      console.warn("[instagram] sync thread failed:", t.peerUsername, err)
    }
  }
  return imported
}
