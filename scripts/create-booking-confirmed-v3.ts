// booking_confirmed_v3 — same as v2 (header "Gravity Stretching Canggu" + the
// name/date/time/ticket body) but adds a 📍 location line as variable {{5}}
// so the client gets the studio's Google Maps link under the ticket.
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-booking-confirmed-v3.ts
//
// After APPROVED, set in Vercel:
//   WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION=booking_confirmed_v3

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "booking_confirmed_v3"

const BODY =
  "Hi {{1}}, your booking is confirmed.\n\n" +
  "Date: {{2}}\n" +
  "Time: {{3}}\n" +
  "Ticket: {{4}}\n\n" +
  "📍 Location: {{5}}\n\n" +
  "Please arrive 10 minutes before the class starts."

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
          example: {
            body_text: [[
              "Anna",
              "Friday, 22 May",
              "09:00-11:00",
              "421",
              "https://maps.app.goo.gl/2c15nQsdKzEBREey9",
            ]],
          },
        },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
  console.log("Wait for APPROVED, then set Vercel env WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION=booking_confirmed_v3")
}

main().catch((e) => { console.error(e); process.exit(1) })
