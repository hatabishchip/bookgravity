// class_reminder_v2 — day-before reminder, WITHOUT the trainer's name (the
// owner doesn't want the client to see who sends it). Single variable:
//   {{1}} = class time (e.g. "09:00–11:00")
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-class-reminder-v2-template.ts

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "class_reminder_v2"

const BODY =
  "Good evening! 🌿\n\n" +
  "A quick reminder from Gravity Stretching — you're booked for a group class tomorrow at {{1}}.\n\n" +
  "Please arrive 10 minutes early so we can start comfortably. See you there! 🙏"

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
        { type: "HEADER", format: "TEXT", text: "Gravity Stretching Canggu" },
        {
          type: "BODY",
          text: BODY,
          example: { body_text: [["09:00–11:00"]] },
        },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
