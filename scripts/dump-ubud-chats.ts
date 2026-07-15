import { createClient } from '@libsql/client'
import { writeFileSync } from 'fs'
import 'dotenv/config'

;(async () => {

const c = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
const UBUD = 'cmp5jggwoa23bv8t1'
const convos = await c.execute({ sql: `SELECT id, clientPhone, clientName, clientLanguage FROM WhatsAppConversation WHERE studioId=? ORDER BY lastMessageAt`, args: [UBUD] })
const out: string[] = []
for (const cv of convos.rows) {
  const msgs = await c.execute({ sql: `SELECT direction, type, body, templateName, status, createdAt FROM WhatsAppMessage WHERE conversationId=? ORDER BY createdAt`, args: [cv.id as string] })
  const bk = await c.execute({ sql: `SELECT COUNT(*) n FROM Booking b JOIN TimeSlot sl ON sl.id=b.slotId WHERE sl.studioId=? AND replace(b.clientPhone,'+','')=?`, args: [UBUD, String(cv.clientPhone)] })
  const n = Number((bk.rows[0] as any)?.n ?? 0)
  out.push('='.repeat(70))
  out.push(`CHAT ${cv.clientName ?? '?'} (${cv.clientPhone}) lang=${cv.clientLanguage ?? '?'} BOOKINGS_UBUD=${n}`)
  for (const m of msgs.rows) {
    const who = m.direction === 'INBOUND' ? 'CLIENT' : 'STUDIO'
    const tpl = m.templateName ? ` [tpl:${m.templateName}]` : ''
    const body = m.body ?? '[' + m.type + ']'
    out.push(`${String(m.createdAt).slice(0, 16)} ${who}${tpl} (${m.status}): ${String(body).replace(/\n/g, ' | ')}`)
  }
}
writeFileSync('/private/tmp/claude-501/-Users-oleksandrdiachuk/f5fb2198-b9c3-4928-99d5-639b8cbded72/scratchpad/ubud-chats.txt', out.join('\n'))
console.log('convos:', convos.rows.length, 'written')

})()