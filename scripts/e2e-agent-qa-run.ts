// Phase 2в (META v2): 12 typical questions through the REAL prod generation
// pipeline WITHOUT sending anything to anyone. Isolated conversation: we never
// bump conversation.lastInboundAt, so the 15-min sweep never sees it and no
// auto-send can happen; the suggestion endpoint only needs the inbound row.
import { createClient } from "@libsql/client"
import { encode } from "next-auth/jwt"
import "dotenv/config"

const STUDIO = "studio_canggu_1778764028263"
const CONVO = "e2ec_qa"
const QUESTIONS: { lang: string; text: string; expect: string }[] = [
  { lang: "EN", text: "Hi! What is gravity stretching exactly?", expect: "SAFE pitch" },
  { lang: "EN", text: "How much is one class? And do you have any packages?", expect: "SAFE price+membership" },
  { lang: "EN", text: "What hours do you have classes?", expect: "SAFE general schedule" },
  { lang: "RU", text: "Здравствуйте! Можно узнать об этом подробнее?", expect: "SAFE ad lead RU" },
  { lang: "ID", text: "Halo, apakah ada kelas untuk pemula?", expect: "SAFE beginner ID" },
  { lang: "EN", text: "Is there a shower at the studio? And where can I park?", expect: "SAFE facilities" },
  { lang: "EN", text: "Do you have classes for kids?", expect: "SAFE kids (only-if-asked)" },
  { lang: "EN", text: "What is your Instagram?", expect: "SAFE IG exact handle" },
  { lang: "EN", text: "Can I book a spot for tomorrow at 9am?", expect: "BOOKING" },
  { lang: "EN", text: "I tried to book on your website but it did not work, can you help?", expect: "BOOKING help" },
  { lang: "EN", text: "I had a class yesterday and my back hurts now. What should I do?", expect: "ESCALATE medical" },
  { lang: "EN", text: "Hi, I run a yoga retreat in Ubud - interested in a partnership?", expect: "ESCALATE collab" },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const cookie = await encode({
    token: { id: "cemk5zlxhw0mp474eb3", sub: "cemk5zlxhw0mp474eb3", role: "SUPER_ADMIN", studioId: STUDIO },
    secret: process.env.AUTH_SECRET!,
    salt: "__Secure-authjs.session-token",
  })

  // conversation without lastInboundAt (invisible to the sweep)
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT OR IGNORE INTO WhatsAppConversation (id, studioId, clientPhone, clientName, lastMessageAt, updatedAt, createdAt, clientLanguage) VALUES (?, ?, '10000000001', 'QA Probe', ?, ?, ?, 'en')`,
    args: [CONVO, STUDIO, now, now, now],
  })

  for (const [i, q] of QUESTIONS.entries()) {
    const mid = `e2eqa_${i}_${Math.random().toString(36).slice(2, 8)}`
    await db.execute({
      sql: `INSERT INTO WhatsAppMessage (id, conversationId, direction, type, body, status, createdAt, fromAgent) VALUES (?, ?, 'INBOUND', 'text', ?, 'delivered', ?, false)`,
      args: [mid, CONVO, q.text, new Date().toISOString()],
    })
    const r = await fetch(`https://bookgravity.com/api/whatsapp/conversations/${CONVO}/suggestion`, {
      method: "POST",
      headers: { cookie: `__Secure-authjs.session-token=${cookie}` },
    })
    const j = (await r.json()) as { suggestion: { category?: string; draft?: string | null; reason?: string | null } | null }
    const s = j.suggestion
    console.log(`\n[${i + 1}/${QUESTIONS.length}] (${q.lang}, ожидание: ${q.expect})`)
    console.log(`Q: ${q.text}`)
    if (!s) console.log(`A: (null - генерация не удалась)`)
    else if (s.category === "SAFE") console.log(`A [SAFE]: ${s.draft ?? "(пустой драфт - молчание)"}`)
    else console.log(`A [${s.category}] -> тренеру: ${s.reason}`)
    await sleep(30000) // Groq TPM window
  }
  console.log("\nDONE (чистка отдельно: cleanup-скриптом)")
})()
