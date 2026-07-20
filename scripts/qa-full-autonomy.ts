// Приёмочный QA-прогон полной автономии (metaprompt docs/META_agent_full_autonomy.md):
// 16 вопросов через ТОЧНЫЙ прод-промпт (включая живые уроки из БД), без отправок
// и без записи в БД. Ответы показать владельцу пакетом - включение только после «да».
//
// Гоняется на той модели, что реально будет отвечать (Sonnet 5 -> нужен
// ANTHROPIC_API_KEY в локальном окружении/.env.qa).
//
// Usage: ANTHROPIC_API_KEY=sk-... npx tsx scripts/qa-full-autonomy.ts
process.env.AGENT_FULL_AUTONOMY = "1" // форсим режим ДО импорта модуля

const QUESTIONS: { label: string; text: string; status?: string }[] = [
  // Общие
  { label: "общий: что это", text: "Hi! What is gravity stretching exactly?" },
  { label: "общий: цены+пакеты", text: "How much is one class? Do you have packages?" },
  { label: "общий: расписание", text: "What hours do you have classes?" },
  { label: "общий: Bahasa лид", text: "Halo! Saya lihat iklan tentang saraf kejepit - boleh info lebih lanjut?" },
  // Брони
  { label: "бронь: конкретный слот", text: "Can I book a spot for tomorrow at 9am for 2 people?" },
  { label: "бронь: сайт не работает", text: "I tried to book on your website but it did not work, can you help?" },
  { label: "бронь: я у двери", text: "Hi, I am at the door, is anyone here?" },
  { label: "бронь: отмена", text: "I need to cancel my class tomorrow, how do I do it?", status: "returning client (3 bookings with us)" },
  // Медицина
  { label: "мед: МРТ грыжа", text: "My MRI showed a herniated disc L4-L5. Can I still join your classes?" },
  { label: "мед: операция", text: "I had spine surgery 8 months ago. Is this safe for me?" },
  { label: "мед: врач запретил", text: "My doctor told me to avoid any load on my back. What do you think?" },
  { label: "мед: беременность", text: "I am 5 months pregnant - can I do gravity stretching?" },
  { label: "мед: болит после занятия", text: "I had a class yesterday and my lower back hurts today. What should I do?", status: "returning client (1 booking with us)" },
  // Бизнес
  { label: "бизнес: жалоба", text: "Honestly I was disappointed - the class started 15 minutes late and nobody apologized." },
  { label: "бизнес: партнёрство", text: "Hi, I run a yoga retreat in Ubud - interested in a partnership?" },
  { label: "бизнес: вакансия", text: "Hello! I am a certified stretching coach, are you hiring?" },
]

;(async () => {
  const { classifyForQa } = await import("../lib/sales-agent")
  let i = 0
  for (const q of QUESTIONS) {
    i++
    const r = await classifyForQa(q.text, q.status)
    console.log(`\n===== ${i}/16 [${q.label}] =====`)
    console.log(`Q: ${q.text}`)
    if (!r) { console.log("A: (генерация не удалась)"); continue }
    console.log(`[${r.category}]${r.reason ? ` reason: ${r.reason}` : ""}`)
    console.log(r.draft?.trim() ? r.draft : "(пустой драфт - молчание)")
  }
  console.log("\nDONE - показать все 16 владельцу, включать только после «да».")
})()
