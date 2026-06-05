// booking_confirmed_v5 — cleaner layout requested by the owner: no "Hi <name>"
// greeting, a human date ("June 6, Friday") and "Class at 7:00 am" instead of a
// 24h range. 4 variables: {{1}} date, {{2}} start time, {{3}} ticket,
// {{4}} location.
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-booking-confirmed-v5.ts
//
// After APPROVED, set in Vercel:
//   WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION=booking_confirmed_v5

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "booking_confirmed_v5"

const BODY =
  "Booking is confirmed.\n\n" +
  "{{1}}\n" +
  "Class at {{2}}\n" +
  "Ticket: {{3}}\n\n" +
  "📍 Location: {{4}}\n\n" +
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
              "June 6, Friday",
              "7:00 am",
              "474",
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
  console.log("Wait for APPROVED, then set Vercel env WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION=booking_confirmed_v5")
}

main().catch((e) => { console.error(e); process.exit(1) })
