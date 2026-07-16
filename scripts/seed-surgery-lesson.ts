import { createClient } from '@libsql/client'
import 'dotenv/config'
;(async () => {
  const c = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const lesson = 'If the client mentions surgery, a recent injury or a medical condition ANYWHERE in the conversation history, do not pitch class benefits yourself - classify as ESCALATE so the trainer decides personally.'
  const dup = await c.execute({ sql: 'SELECT id FROM AgentLesson WHERE lesson=?', args: [lesson] })
  if (!dup.rows.length) {
    await c.execute({ sql: "INSERT INTO AgentLesson (id, source, lesson, active) VALUES (?, 'owner', ?, true)", args: ['own_' + Math.random().toString(36).slice(2, 14), lesson] })
    console.log('lesson added')
  } else console.log('dup')
})()
