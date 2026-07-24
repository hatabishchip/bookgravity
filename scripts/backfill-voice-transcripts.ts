// One-off backfill (owner metaprompt 24.07): transcribe inbound WhatsApp
// voice notes of the last 14 days so staff can read old conversations.
// READ + transcript writes only - the agent does NOT answer these (the
// dialogs are long settled). Media ids older than ~30 days are expired on
// Meta's side; those are skipped and logged, which is expected.
// Run: npx tsx scripts/backfill-voice-transcripts.ts   (needs DEEPGRAM_API_KEY)
import "dotenv/config"
import { prisma } from "../lib/prisma"
import { transcribeVoiceMessage } from "../lib/transcribe"

async function main() {
  if (!process.env.DEEPGRAM_API_KEY) throw new Error("DEEPGRAM_API_KEY missing")
  const since = new Date(Date.now() - 14 * 24 * 3600_000)
  const notes = await prisma.whatsAppMessage.findMany({
    where: {
      direction: "INBOUND",
      type: "audio",
      body: null,
      mediaUrl: { not: null },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, conversation: { select: { clientName: true } } },
  })
  console.log(`voice notes without transcript since ${since.toISOString().slice(0, 10)}: ${notes.length}`)
  let ok = 0
  for (const n of notes) {
    const t = await transcribeVoiceMessage(n.id)
    console.log(
      `${n.createdAt.toISOString().slice(0, 16)} ${(n.conversation.clientName ?? "?").slice(0, 20)}: ${t ? `"${t.slice(0, 70)}"` : "SKIP (expired media / silence / error)"}`,
    )
    if (t) ok++
  }
  console.log(`done: ${ok}/${notes.length} transcribed`)
}

main().finally(() => prisma.$disconnect())
