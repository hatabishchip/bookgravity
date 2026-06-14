// booking_confirmed_v11 — single-booking confirmation, identical to v10 but the
// closing line is "See you at the studio" (no emoji). Owner-approved (buttons,
// 13.06.2026). Same 4 body vars + quick-reply "Cancel booking", so activation
// is just WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION=booking_confirmed_v11 — no code.
//   {{1}} date, {{2}} start time, {{3}} ticket, {{4}} maps link.
import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "booking_confirmed_v11"

const BODY =
  "You're booked 💖\n\n" +
  "{{1}}\n" +
  "{{2}} class\n" +
  "Ticket: #{{3}}\n\n" +
  "📍 Location:\n{{4}}\n\n" +
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
          example: { body_text: [["June 9 (Tuesday)", "7:00 AM", "352", "https://maps.app.goo.gl/2c15nQsdKzEBREey9"]] },
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
