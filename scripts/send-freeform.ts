// Send one approved free-form text to a client (open 24h window) and mirror
// into the inbox. Args: phone, then text via TEXT env.
import { createClient } from '@libsql/client'
import 'dotenv/config'

const GRAPH = 'https://graph.facebook.com/v21.0'
const phone = process.argv[2]
const text = process.env.TEXT!

;(async () => {
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const s = await db.execute(`SELECT id, whatsappPhoneNumberId, whatsappAccessToken FROM Studio WHERE slug='canggu'`)
  const row = s.rows[0] as unknown as { id: string; whatsappPhoneNumberId: string|null; whatsappAccessToken: string|null }
  const token = row.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
  const pnid = row.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
  const res = await fetch(`${GRAPH}/${pnid}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
  })
  const j = await res.json() as { messages?: {id:string}[]; error?: {message:string} }
  const waId = j.messages?.[0]?.id ?? null
  console.log(res.ok && waId ? 'SENT ' + waId : 'FAIL ' + JSON.stringify(j.error))
  const convo = await db.execute({ sql: `SELECT id FROM WhatsAppConversation WHERE clientPhone=? AND studioId=?`, args: [phone, row.id] })
  const cid = convo.rows[0]?.id as string | undefined
  if (cid && waId) {
    const now = new Date().toISOString()
    await db.execute({ sql: `INSERT INTO WhatsAppMessage (id, conversationId, direction, type, body, waMessageId, status, createdAt, fromAgent) VALUES (?,?,'OUTBOUND','text',?,?,?,?,false)`, args: ['man_'+Math.random().toString(36).slice(2,14), cid, text, waId, 'sent', now] })
    await db.execute({ sql: `UPDATE WhatsAppConversation SET lastMessageAt=?, updatedAt=? WHERE id=?`, args: [now, now, cid] })
    console.log('mirrored to inbox')
  }
})()
