// class_today_confirm — a gentle, time-neutral same-day check-in the trainer
// (or admin) can send to confirm a client is still coming to today's class.
// No "good morning/afternoon" so it reads naturally at any time of day.
// No variables.
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-class-today-confirm-template.ts

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "class_today_confirm"

const BODY =
  "Hello! 🌿\n\n" +
  "Just a gentle reminder about your class today — are you still able to join us? " +
  "We'd love to see you on the mat. 🙏"

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
      components: [{ type: "BODY", text: BODY }],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
