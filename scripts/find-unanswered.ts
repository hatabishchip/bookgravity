// Phase E: conversations (all history, all studios) where the CLIENT has the
// last word - i.e. the last message is INBOUND with no studio reply after it.
import { createClient } from '@libsql/client'
import 'dotenv/config'

;(async () => {
  const c = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const rows = await c.execute(`
    SELECT wc.id, s.slug, wc.clientPhone, wc.clientName, wc.lastInboundAt,
           m.body AS lastBody, m.type AS lastType, m.createdAt AS lastAt
    FROM WhatsAppConversation wc
    JOIN Studio s ON s.id = wc.studioId
    JOIN WhatsAppMessage m ON m.conversationId = wc.id
    WHERE m.createdAt = (SELECT MAX(m2.createdAt) FROM WhatsAppMessage m2 WHERE m2.conversationId = wc.id)
      AND m.direction = 'INBOUND'
    ORDER BY m.createdAt DESC
  `)
  for (const r of rows.rows) {
    const age = Math.round((Date.now() - new Date(String(r.lastInboundAt ?? r.lastAt)).getTime()) / 3600000)
    console.log(`${r.slug} | ${r.clientName} | ${r.clientPhone} | ${String(r.lastAt).slice(0,16)} | window:${age < 24 ? 'OPEN' : 'closed ' + Math.round(age/24) + 'd'} | [${r.lastType}] ${String(r.lastBody ?? '').replace(/\n/g, ' ').slice(0, 120)}`)
  }
  console.log('TOTAL:', rows.rows.length)
})()
