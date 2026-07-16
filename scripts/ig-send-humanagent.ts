// One-off: owner-approved HUMAN_AGENT reply to @beduinheart (16.07).
import "dotenv/config"
import { createClient } from "@libsql/client"

const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!
const TEXT = "Hi! So sorry for the late reply 🙏 Yes, we have kids classes - 300,000 IDR per class. For your son's one-to-one session our trainer will help you pick the right time and will confirm the age details with you. The easiest way: book any slot at https://bookgravity.com or just reply here and we will arrange it for you 🌿"

;(async () => {
  // peer id: from the mirrored conversation (clientName IG @beduinheart)
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const c = await db.execute(`SELECT id, clientPhone FROM WhatsAppConversation WHERE clientName='IG @beduinheart'`)
  if (!c.rows.length) { console.log("convo not found"); process.exit(1) }
  const convoId = c.rows[0].id as string
  const psid = String(c.rows[0].clientPhone).slice(3)
  const r = await fetch(`https://graph.instagram.com/v21.0/me/messages?access_token=${TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT", message: { text: TEXT } }),
  })
  const j = (await r.json()) as { message_id?: string; error?: { message?: string } }
  console.log(r.ok && j.message_id ? "SENT " + j.message_id : "FAIL " + (j.error?.message ?? r.status))
  if (r.ok && j.message_id) {
    const now = new Date().toISOString()
    await db.execute({
      sql: `INSERT INTO WhatsAppMessage (id, conversationId, direction, type, body, waMessageId, status, createdAt, fromAgent) VALUES (?,?,'OUTBOUND','text',?,?,?,?,false)`,
      args: ["igha_" + Math.random().toString(36).slice(2, 12), convoId, TEXT, j.message_id, "sent", now],
    })
    await db.execute({ sql: `UPDATE WhatsAppConversation SET lastMessageAt=?, updatedAt=? WHERE id=?`, args: [now, now, convoId] })
    console.log("mirrored to inbox")
  }
})()
