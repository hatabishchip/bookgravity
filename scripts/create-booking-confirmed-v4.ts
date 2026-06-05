// booking_confirmed_v4 — same as v3 (header + name/date/time/ticket/location)
// plus a cancellation line with a one-tap WhatsApp cancel link as {{6}}. The
// link opens a chat with the studio pre-filled with "Cancel <code>", which the
// cancel bot recognises.
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-booking-confirmed-v4.ts
//
// After APPROVED, set in Vercel:
//   WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION=booking_confirmed_v4

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "booking_confirmed_v4"

const BODY =
  "Hi {{1}}, your booking is confirmed.\n\n" +
  "Date: {{2}}\n" +
  "Time: {{3}}\n" +
  "Ticket: {{4}}\n\n" +
  "📍 Location: {{5}}\n\n" +
  "Please arrive 10 minutes before the class starts.\n\n" +
  "🔄 Free cancellation up to 2 hours before class — tap to cancel:\n{{6}}\n\n" +
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
              "https://wa.me/628213130468?text=Cancel%20421",
            ]],
          },
        },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
  console.log("Wait for APPROVED, then set Vercel env WHATSAPP_TEMPLATE_BOOKING_CONFIRMATION=booking_confirmed_v4")
}

main().catch((e) => { console.error(e); process.exit(1) })
