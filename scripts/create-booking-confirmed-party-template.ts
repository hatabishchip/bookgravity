// booking_confirmed_party — confirmation for a booking of 2+ people made from
// one phone. Owner-approved (buttons, 13.06.2026): one message, names the party
// size and lists every ticket. Single bookings keep booking_confirmed_v10.
//   {{1}} party size ("3"), {{2}} date, {{3}} start time, {{4}} tickets
//   ("#271, #272, #273"), {{5}} maps link.
// The quick-reply "Cancel booking" button cancels the WHOLE group — the send
// binds it to a CANCELALL:<leadTicket> payload (see lib/cancel-bot.ts).
//
// Run: cd bookgravity && WHATSAPP_ACCESS_TOKEN=... npx tsx \
//   scripts/create-booking-confirmed-party-template.ts
// After approval: set WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION_PARTY=
//   booking_confirmed_party.
import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "booking_confirmed_party"

const BODY =
  "You're booked for {{1}} people 💖\n\n" +
  "{{2}}\n" +
  "{{3}} class\n" +
  "Tickets: {{4}}\n\n" +
  "📍 Location:\n{{5}}\n\n" +
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
            body_text: [["3", "Friday, 13 June", "11:00 am", "#271, #272, #273", "https://maps.app.goo.gl/2c15nQsdKzEBREey9"]],
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
