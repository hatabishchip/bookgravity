import { createClient } from '@libsql/client'
import 'dotenv/config'
;(async () => {
  const c = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const lessons = [
    'The studio Instagram is exactly @gravitystretchcanggu (one word, no dots, no "ing" after stretch). NEVER invent or guess a handle, phone number, email or link - if a contact is not in your knowledge, say you will pass it to the team instead of making one up.',
    'A client asking to book a trial, to book for a friend too, or saying the website booking does not work is BOOKING not SAFE - do not answer with generic info, flag it for the trainer to help them book.'
  ]
  for (const l of lessons) {
    const dup = await c.execute({ sql: 'SELECT id FROM AgentLesson WHERE lesson=?', args: [l] })
    if (dup.rows.length) { console.log('skip dup'); continue }
    await c.execute({ sql: 'INSERT INTO AgentLesson (id, source, lesson, active) VALUES (?, ?, ?, true)', args: ['own_'+Math.random().toString(36).slice(2,14), 'owner', l] })
    console.log('added lesson')
  }
})()
