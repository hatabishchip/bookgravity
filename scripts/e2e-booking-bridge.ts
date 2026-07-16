// Smoke: BOOKING bridge draft (owner 17.07) through the REAL prod generation
// pipeline WITHOUT sending anything. Same isolated-conversation pattern as
// e2e-agent-qa-run.ts: no lastInboundAt -> the sweep never sees it.
import { createClient } from "@libsql/client"
import { encode } from "next-auth/jwt"
import "dotenv/config"

const STUDIO = "studio_canggu_1778764028263"
const CONVO = "e2ec_bridge"
const QUESTIONS = [
  "Hi! Can I book a spot for tomorrow morning?",
  "Здравствуйте! Хочу записаться на занятие на этой неделе, как это сделать?",
]

;(async () => {
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const mode = process.argv[2] ?? "run"
  if (mode === "cleanup") {
    await db.execute({ sql: `DELETE FROM AgentSuggestion WHERE conversationId = ?`, args: [CONVO] })
    await db.execute({ sql: `DELETE FROM WhatsAppMessage WHERE conversationId = ?`, args: [CONVO] })
    await db.execute({ sql: `DELETE FROM WhatsAppConversation WHERE id = ?`, args: [CONVO] })
    console.log("cleanup done")
    return
  }

  const cookie = await encode({
    token: { id: "cemk5zlxhw0mp474eb3", sub: "cemk5zlxhw0mp474eb3", role: "SUPER_ADMIN", studioId: STUDIO },
    secret: process.env.AUTH_SECRET!,
    salt: "__Secure-authjs.session-token",
  })
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT OR IGNORE INTO WhatsAppConversation (id, studioId, clientPhone, clientName, lastMessageAt, updatedAt, createdAt, clientLanguage) VALUES (?, ?, '10000000002', 'Bridge Probe', ?, ?, ?, 'en')`,
    args: [CONVO, STUDIO, now, now, now],
  })

  for (const [i, text] of QUESTIONS.entries()) {
    const mid = `e2ebr_${i}_${Math.random().toString(36).slice(2, 8)}`
    await db.execute({
      sql: `INSERT INTO WhatsAppMessage (id, conversationId, direction, type, body, status, createdAt, fromAgent) VALUES (?, ?, 'INBOUND', 'text', ?, 'delivered', ?, false)`,
      args: [mid, CONVO, text, new Date().toISOString()],
    })
    const r = await fetch(`https://bookgravity.com/api/whatsapp/conversations/${CONVO}/suggestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `__Secure-authjs.session-token=${cookie}` },
      body: JSON.stringify({ inboundMessageId: mid }),
    })
    const jr = (await r.json().catch(() => null)) as { suggestion?: { category?: string; draft?: string } } | null
    const j = jr?.suggestion
    console.log(`\nQ: ${text}`)
    console.log(`-> ${r.status} [${j?.category ?? "?"}] ${j?.draft ?? "(no draft)"}`)
  }
})().catch((e) => { console.error(e); process.exit(1) })
