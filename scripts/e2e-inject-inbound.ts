// E2E helper: (re)create the Sancho bot chat in Canggu and inject a fake
// INBOUND text so the autopilot sweep has something to answer. Test-only.
import { createClient } from '@libsql/client'
import 'dotenv/config'

;(async () => {
  const c = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const now = new Date().toISOString()
  let convoId: string
  const existing = await c.execute(`SELECT id FROM WhatsAppConversation WHERE clientPhone='6282145546405' AND studioId='studio_canggu_1778764028263'`)
  if (existing.rows.length) {
    convoId = existing.rows[0].id as string
  } else {
    convoId = 'e2ec_' + Math.random().toString(36).slice(2, 14)
    await c.execute({
      sql: `INSERT INTO WhatsAppConversation (id, studioId, clientPhone, clientName, lastMessageAt, lastInboundAt, updatedAt, createdAt, clientLanguage) VALUES (?, 'studio_canggu_1778764028263', '6282145546405', 'Sancho E2E', ?, ?, ?, ?, 'en')`,
      args: [convoId, now, now, now, now],
    })
  }
  const id = 'e2e_' + Math.random().toString(36).slice(2, 14)
  await c.execute({
    sql: `INSERT INTO WhatsAppMessage (id, conversationId, direction, type, body, status, createdAt, fromAgent) VALUES (?, ?, 'INBOUND', 'text', ?, 'delivered', ?, false)`,
    args: [id, convoId, 'Hi! What exactly is gravity stretching? And how much is one group class?', now],
  })
  await c.execute({
    sql: `UPDATE WhatsAppConversation SET lastInboundAt=?, lastMessageAt=?, updatedAt=? WHERE id=?`,
    args: [now, now, now, convoId],
  })
  console.log('convo', convoId, 'inbound', id)
})()
