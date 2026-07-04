// One-shot: recompute WhatsAppConversation unread counters to the new rule
// (owner 2026-07-03): unread = number of trailing INBOUND client messages that
// nobody has answered. A staff reply (OUTBOUND) or a reaction on the client's
// message ends the run. Idempotent - safe to re-run.
import { createClient } from "@libsql/client"
import "dotenv/config"

const url = process.env.DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url) { console.error("DATABASE_URL not set"); process.exit(1) }

const c = createClient({ url, ...(authToken ? { authToken } : {}) })
;(async () => {
  const convos = await c.execute("SELECT id FROM WhatsAppConversation")
  let changed = 0, unanswered = 0
  for (const row of convos.rows) {
    const cid = row.id as string
    // Newest first; walk until an OUTBOUND or a reacted message.
    const msgs = await c.execute({
      sql: "SELECT direction, reaction FROM WhatsAppMessage WHERE conversationId = ? ORDER BY createdAt DESC LIMIT 200",
      args: [cid],
    })
    let count = 0
    for (const m of msgs.rows) {
      if ((m.direction as string) === "OUTBOUND") break
      if (m.reaction != null && String(m.reaction).length > 0) break // staff reacted → answered
      count++
    }
    // Read current to only write when it differs.
    const cur = await c.execute({ sql: "SELECT unreadAdmin, unreadTrainer FROM WhatsAppConversation WHERE id = ?", args: [cid] })
    const ua = Number(cur.rows[0]?.unreadAdmin ?? 0)
    const ut = Number(cur.rows[0]?.unreadTrainer ?? 0)
    if (ua !== count || ut !== count) {
      await c.execute({ sql: "UPDATE WhatsAppConversation SET unreadAdmin = ?, unreadTrainer = ? WHERE id = ?", args: [count, count, cid] })
      changed++
    }
    if (count > 0) unanswered++
  }
  console.log(`conversations: ${convos.rows.length}, updated: ${changed}, now-unanswered: ${unanswered}`)
})()
