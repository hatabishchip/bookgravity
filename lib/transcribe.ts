// Voice-note transcription (owner metaprompt 24.07.2026): WhatsApp voice
// messages are transcribed with Deepgram and the text lands in the message's
// `body` - the inbox shows it under the audio player (translation toggles work
// on it like any text), and the sales agent answers it in full instead of
// asking the client to type. No DEEPGRAM_API_KEY in env = feature is dark and
// the agent falls back to the polite "could you type it out?" ask.
import { prisma } from "@/lib/prisma"
import { fetchMetaMedia, getConfigFor } from "@/lib/whatsapp-cloud"
import { elogError } from "@/lib/elog"

// nova-2 pre-recorded + language auto-detect (EN/RU/Bahasa clients) +
// smart_format (punctuation, numbers). ~$0.0043/min - a 30s note is a
// fraction of a cent.
const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen?model=nova-2&detect_language=true&smart_format=true"

/**
 * Transcribe one inbound WhatsApp voice message and persist the text into its
 * `body`. Idempotent: a message that already has a body (transcribed earlier,
 * or a caption) is returned as-is. Fail-open: any error returns null and the
 * caller keeps the old "[voice note]" behaviour.
 */
export async function transcribeVoiceMessage(messageId: string): Promise<string | null> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) return null
  try {
    const msg = await prisma.whatsAppMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        type: true,
        body: true,
        mediaUrl: true,
        mediaMime: true,
        conversation: {
          select: { studio: { select: { isDefault: true, whatsappPhoneNumberId: true, whatsappAccessToken: true } } },
        },
      },
    })
    if (!msg || msg.type !== "audio" || !msg.mediaUrl) return null
    if (msg.body?.trim()) return msg.body

    const fetched = await fetchMetaMedia(msg.mediaUrl, getConfigFor(msg.conversation.studio))
    if (!fetched.ok) {
      // Old media ids expire on Meta's side (~30 days) - normal for backfill.
      void elogError("voice:transcribe", "media download failed", { messageId, error: fetched.error })
      return null
    }

    const r = await fetch(DEEPGRAM_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": fetched.mimeType || msg.mediaMime || "audio/ogg",
      },
      body: Buffer.from(fetched.bytes),
    })
    if (!r.ok) {
      void elogError("voice:transcribe", `deepgram HTTP ${r.status}`, { messageId, error: (await r.text()).slice(0, 300) })
      return null
    }
    const j = (await r.json()) as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] }
    }
    const transcript = j.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim()
    if (!transcript) return null // silence / unintelligible - keep the polite ask

    await prisma.whatsAppMessage.update({ where: { id: msg.id }, data: { body: transcript } })
    return transcript
  } catch (err) {
    void elogError("voice:transcribe", "transcription failed", {
      messageId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
