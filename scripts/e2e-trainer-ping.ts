// E2E phase 3: BOOKING inbound -> sweep pings the trainer via WhatsApp.
// Uses a TEMP trainer whose number is the Sancho bot, so no real trainer is
// disturbed. Run sweep manually afterwards, then verify + cleanup.
import { createClient } from '@libsql/client'
import 'dotenv/config'

const mode = process.argv[2] // setup | verify | cleanup
const SANCHO = '6282145546405'
const STUDIO = 'studio_canggu_1778764028263'

;(async () => {
  const c = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  if (mode === 'setup') {
    const now = new Date().toISOString()
    await c.execute({ sql: `INSERT INTO User (id, email, password, role, studioId, updatedAt, createdAt) VALUES ('e2e_user_ping', 'e2e-ping@test.local', 'x-no-login', 'TRAINER', ?, ?, ?)`, args: [STUDIO, now, now] })
    await c.execute({ sql: `INSERT INTO Trainer (id, userId, name, studioId, whatsapp, notifyWhatsapp, color, createdAt, updatedAt) VALUES ('e2e_trainer_ping', 'e2e_user_ping', 'E2E Ping Probe', ?, ?, true, '#999999', ?, ?)`, args: [STUDIO, SANCHO, now, now] })
    await c.execute({ sql: `INSERT INTO WhatsAppConversation (id, studioId, clientPhone, clientName, assignedTrainerId, lastMessageAt, lastInboundAt, updatedAt, createdAt, clientLanguage) VALUES ('e2ec_ping', ?, ?, 'Sancho E2E', 'e2e_trainer_ping', ?, ?, ?, ?, 'en')`, args: [STUDIO, SANCHO, now, now, now, now] })
    await c.execute({ sql: `INSERT INTO WhatsAppMessage (id, conversationId, direction, type, body, status, createdAt, fromAgent) VALUES ('e2em_ping', 'e2ec_ping', 'INBOUND', 'text', 'Can I book a spot for tomorrow at 9am? And my friend wants to join too.', 'delivered', ?, false)`, args: [now] })
    console.log('setup done')
  } else if (mode === 'verify') {
    const s = await c.execute(`SELECT category, status, reason, trainerNotifiedAt FROM AgentSuggestion WHERE conversationId='e2ec_ping'`)
    console.log(JSON.stringify(s.rows, null, 1))
  } else if (mode === 'cleanup') {
    await c.execute(`DELETE FROM AgentSuggestion WHERE conversationId='e2ec_ping'`)
    await c.execute(`DELETE FROM WhatsAppMessage WHERE conversationId='e2ec_ping'`)
    await c.execute(`DELETE FROM WhatsAppConversation WHERE id='e2ec_ping'`)
    await c.execute(`DELETE FROM Trainer WHERE id='e2e_trainer_ping'`)
    await c.execute(`DELETE FROM User WHERE id='e2e_user_ping'`)
    console.log('cleanup done')
  }
})()
