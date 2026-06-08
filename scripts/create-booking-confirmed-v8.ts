// booking_confirmed_v8 — owner's wording. 4 body vars + a quick-reply
// "Cancel booking" button (same cancel flow as v7). No header line.
//   {{1}} date "June 9 (Tuesday)", {{2}} start "7:00 AM", {{3}} ticket "352",
//   {{4}} maps link.
//
// Run: WHATSAPP_ACCESS_TOKEN=... npx tsx scripts/create-booking-confirmed-v8.ts
// After APPROVED → code default flips to booking_confirmed_v8.

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "booking_confirmed_v8"

const BODY =
  "You're booked 💖\n\n" +
  "{{1}}\n" +
  "{{2}} class\n" +
  "Ticket: #{{3}}\n\n" +
  "📍 Location:\n{{4}}\n\n" +
  "Please arrive 10 minutes before the class starts.\n\n" +
  "🔄 Free cancellation up to 2 hours before class — just tap the button below.\n\n" +
  "See you on the mat! 🌿"

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
          example: {
            body_text: [[
              "June 9 (Tuesday)",
              "7:00 AM",
              "352",
              "https://maps.app.goo.gl/2c15nQsdKzEBREey9",
            ]],
          },
        },
        { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Cancel booking" }] },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
