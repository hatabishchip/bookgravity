// One-shot: lessons mined from the FULL Ubud chat history (75 convos, 753
// msgs, 08.06-15.07.2026) - phase D of docs/META_agent_autopilot.md.
import { createClient } from '@libsql/client'
import 'dotenv/config'

const LESSONS = [
  "Answer pre-sale questions (price, availability, bringing a friend or child) as fast and completely as possible and ALWAYS end with a concrete invitation or the booking link - in Ubud a next-morning reply and dead-end answers lost warm leads.",
  "When a client wants to cancel, immediately offer a concrete alternative slot ('how about Tuesday 9am or 11am?') instead of just accepting - reschedule offers in Ubud converted cancellations into attended classes and repeat bookings.",
  "Answer price questions warmly and completely: price, what is included, accepted payment methods (cash, card, QRIS) - a bare number with no follow-up question ended Ubud conversations without a booking.",
  "If the client cannot find the studio or a map link does not open, instantly resend the full Google Maps link plus a short parking or landmark hint - broken location links in Ubud nearly cost attendances.",
  "If the client doubts which studio their booking belongs to (Ubud vs Canggu), confirm the studio by name in the first sentence and attach that studio's map link.",
  "If the client writes in Indonesian, reply in Indonesian - Ubud locals explicitly asked for it ('Pakek bahasa indonesia aja ya').",
  "When automatic reminders confuse a client (duplicates, unexpected wording), explain honestly and lightly that reminders are sent automatically by the booking app and everything is fine.",
  "After a client clearly enjoyed a class, it is welcome to softly ask for a Google Maps review or an Instagram tag - happy Ubud clients gladly agreed.",
]

;(async () => {
  const c = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  for (const lesson of LESSONS) {
    const dup = await c.execute({ sql: `SELECT id FROM AgentLesson WHERE lesson=?`, args: [lesson] })
    if (dup.rows.length) { console.log('skip dup'); continue }
    const id = 'ubud_' + Math.random().toString(36).slice(2, 14)
    await c.execute({
      sql: `INSERT INTO AgentLesson (id, source, lesson, active) VALUES (?, 'ubud_history', ?, true)`,
      args: [id, lesson],
    })
    console.log('added', id)
  }
  const n = await c.execute(`SELECT COUNT(*) n FROM AgentLesson`)
  console.log('total lessons:', (n.rows[0] as { n: unknown }).n)
})()
