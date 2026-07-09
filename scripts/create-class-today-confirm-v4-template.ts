// class_today_confirm_v4 - same owner-approved body as v3, plus two
// quick-reply buttons (owner-approved 09.07.2026, chat audit: clients kept
// answering the check-in with "can I reschedule?" typed by hand). Button
// taps arrive as normal inbound replies and forward to the trainer as-is.
//
// After Meta approves: WHATSAPP_TEMPLATE_TODAY_CONFIRM_V2=class_today_confirm_v4
// (the activation watcher handles it).
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-class-today-confirm-v4-template.ts

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "class_today_confirm_v4"

const BODY =
  "Hello 👋\n\n" +
  "Just a gentle reminder about your class today - are you still able to join us?\n\n" +
  "📍 Location:\n{{1}}\n\n" +
  "We'd love to see you at the studio ☀️"

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) { console.error("WHATSAPP_ACCESS_TOKEN not set"); process.exit(1) }
  const r = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: NAME,
      language: "en",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text: BODY,
          example: { body_text: [["https://maps.app.goo.gl/example"]] },
        },
        {
          type: "BUTTONS",
          buttons: [
            { type: "QUICK_REPLY", text: "Yes, I'll be there" },
            { type: "QUICK_REPLY", text: "Need to reschedule" },
          ],
        },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
