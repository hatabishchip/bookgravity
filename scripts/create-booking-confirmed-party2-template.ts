// booking_confirmed_party2 — party (2+ people) confirmation, identical to
// booking_confirmed_party but the closing line is "See you at the studio"
// (no emoji). Owner-approved (buttons, 13.06.2026). Same 5 body vars +
// quick-reply "Cancel booking", so activation is just
// WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION_PARTY=booking_confirmed_party2 — no code.
//   {{1}} party size, {{2}} date, {{3}} start time, {{4}} tickets, {{5}} maps.
import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "booking_confirmed_party2"

const BODY =
  "You're booked for {{1}} people 💖\n\n" +
  "{{2}}\n" +
  "{{3}} class\n" +
  "Tickets: {{4}}\n\n" +
  "📍 Location:\n{{5}}\n\n" +
  "See you at the studio"

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
            body_text: [["6", "June 14 (Sunday)", "11:00 AM", "#907, #524, #936, #377, #507, #760", "https://maps.app.goo.gl/2c15nQsdKzEBREey9"]],
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
