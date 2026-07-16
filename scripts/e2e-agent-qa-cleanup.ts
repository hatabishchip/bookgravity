import { createClient } from "@libsql/client"
import "dotenv/config"
;(async () => {
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  for (const convo of ["e2ec_qa"]) {
    await db.execute({ sql: `DELETE FROM AgentSuggestion WHERE conversationId=?`, args: [convo] })
    await db.execute({ sql: `DELETE FROM WhatsAppMessage WHERE conversationId=?`, args: [convo] })
    await db.execute({ sql: `DELETE FROM WhatsAppConversation WHERE id=?`, args: [convo] })
  }
  console.log("qa cleanup done")
})()
