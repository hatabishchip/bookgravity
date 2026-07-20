// Активация полной автономии агента (metaprompt docs/META_agent_full_autonomy.md).
// Запускать ТОЛЬКО после приёмки владельцем QA-прогона (scripts/qa-full-autonomy.ts).
//
// Что делает: переписывает уроки в AgentLesson, противоречащие новой политике
// (старые тексты «flag it for the trainer» ломали бы новый промпт), и печатает
// чек-лист финальных шагов активации.
//
// Usage: npx tsx scripts/activate-full-autonomy.ts
import "dotenv/config"
import { createClient } from "@libsql/client"

const REWRITES: { match: string; newLesson: string }[] = [
  {
    // Урок №10: бронь = BOOKING тренеру -> теперь агент сам ведёт к самозаписи.
    match: "%is BOOKING not SAFE%",
    newLesson:
      "A client asking to book, to book for a friend, or saying the website booking does not work is label BOOKING - answer it YOURSELF with the self-service playbook: the live schedule and free booking are at https://bookgravity.com (pick a time, enter name + WhatsApp number, confirm the code; pay at the studio - cash, card, QRIS or transfer; choose the number of spots for friends/family). Help step by step if the site gives trouble. Never claim a booking is made, moved or cancelled, and never promise that a coach will follow up.",
  },
  {
    // Мед-урок (own_e0395lrzvk): «ESCALATE no self-reply» -> отвечаем формулой.
    match: "%Medical boundary. ESCALATE (no self-reply)%",
    newLesson:
      "Medical situations (label MEDICAL) are ANSWERED by you, warmly: we always start from absolute zero, we never work through pain, and for every situation we find a soft suitable way to work with the body - the trainer asks about your body at the studio and adapts everything personally; the lianas hold your full weight, there is nowhere to fall. For complex cases (surgery, serious restrictions, pregnancy) warmly recommend a private 1-on-1 session (1,300,000 IDR). Honest pace only (lighter after class 1, pain eases around 4-6, stable ~10). Never diagnose, never promise healing or personal safety, never use the word 'doctor'.",
  },
  {
    // Урок №12 (инверсии): «treat it as BOOKING so a coach picks» -> отвечаем сами.
    match: "%Inverted positions%",
    newLesson:
      "Inverted positions (hanging upside down) are a special add-on offered only in classes led or assisted by a coach certified for inversions - not every class has one. Never promise or confirm an inversion in a specific class; answer that inversion is introduced gradually when the body is ready, the trainer decides on the spot, and regular lifting and straps work is available in every class. Guide the client to book normally at https://bookgravity.com.",
  },
]

;(async () => {
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  for (const r of REWRITES) {
    const rows = await db.execute({ sql: `SELECT id, substr(lesson,1,60) s FROM AgentLesson WHERE lesson LIKE ? AND active=1`, args: [r.match] })
    if (!rows.rows.length) { console.log(`НЕ НАЙДЕН: ${r.match}`); continue }
    for (const row of rows.rows) {
      await db.execute({ sql: `UPDATE AgentLesson SET lesson=? WHERE id=?`, args: [r.newLesson, row.id] })
      console.log(`переписан [${row.id}]: было "${row.s}..."`)
    }
  }
  console.log(`
ЧЕК-ЛИСТ АКТИВАЦИИ (руками/чатом, по порядку):
1. printf '1' | vercel env add AGENT_FULL_AUTONOMY production --scope team_dHvdiyujqNu93GGaXK6i6Cc4
2. ANTHROPIC_API_KEY уже в prod env (Sonnet 5)? Если нет - добавить.
3. cd ~/Documents/Claude/bookgravity && vercel --prod --yes (env читается из билда)
4. Смоук: POST /suggestion на тестовый чат - категория/драфт по новой схеме.
5. Обновить память проекта: полная автономия ВКЛЮЧЕНА.`)
})()
