// Owner-approved one-off IG reply. Usage:
//   npx tsx scripts/ig-send-approved.ts '<clientName in DB>' '<text>'
// Uses the freshest IG token (EventLog ig:token beats env, same as lib/instagram).
// Sends with HUMAN_AGENT tag (window is long gone); falls back to a plain send
// if the tag is rejected (plain worked at 27h on 16.07).
import "dotenv/config"
import { createClient } from "@libsql/client"

const [, , CLIENT, TEXT] = process.argv
if (!CLIENT || !TEXT) { console.log("usage: ig-send-approved.ts '<clientName>' '<text>'"); process.exit(1) }

;(async () => {
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  // Token lives in EventLog.message (starts with IGAA); env is only the seed.
  const tok = await db.execute(`SELECT message FROM EventLog WHERE scope='ig:token' ORDER BY createdAt DESC LIMIT 1`)
  let token = process.env.INSTAGRAM_ACCESS_TOKEN!
  const msg = String(tok.rows[0]?.message ?? "")
  if (msg.startsWith("IGAA")) token = msg

  const c = await db.execute({ sql: `SELECT id, clientPhone FROM WhatsAppConversation WHERE clientName = ?`, args: [CLIENT] })
  if (!c.rows.length) { console.log("convo not found:", CLIENT); process.exit(1) }
  const convoId = c.rows[0].id as string
  const igsid = String(c.rows[0].clientPhone).slice(3)

  async function send(body: object) {
    const r = await fetch(`https://graph.instagram.com/v21.0/me/messages?access_token=${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    return { ok: r.ok, j: (await r.json()) as { message_id?: string; error?: { message?: string } } }
  }

  let res = await send({ recipient: { id: igsid }, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT", message: { text: TEXT } })
  if (!res.ok) {
    console.log("HUMAN_AGENT rejected:", res.j.error?.message, "- trying plain send")
    res = await send({ recipient: { id: igsid }, message: { text: TEXT } })
  }
  if (!res.ok || !res.j.message_id) { console.log("FAIL:", res.j.error?.message); process.exit(1) }
  console.log("SENT", res.j.message_id)

  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO WhatsAppMessage (id, conversationId, direction, type, body, waMessageId, status, createdAt, fromAgent) VALUES (?,?,'OUTBOUND','text',?,?,?,?,false)`,
    args: ["igap_" + Math.random().toString(36).slice(2, 12), convoId, TEXT, res.j.message_id, "sent", now],
  })
  await db.execute({ sql: `UPDATE WhatsAppConversation SET lastMessageAt=?, updatedAt=? WHERE id=?`, args: [now, now, convoId] })
  console.log("mirrored to inbox")
})()
