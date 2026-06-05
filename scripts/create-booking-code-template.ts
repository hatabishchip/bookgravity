// booking_code — minimal OTP template so the 2-digit booking code shows up
// front-and-centre in the WhatsApp notification popup with almost no other
// text. One variable {{1}} = the code. (Meta forbids a variable at the very
// start/end, so it's wrapped with minimal text.)
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-booking-code-template.ts
//
// After APPROVED, set in Vercel:
//   WHATSAPP_TEMPLATE_OTP=booking_code

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "booking_code"

const BODY = "Code {{1}} — Gravity Stretching booking confirmation."

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
        { type: "BODY", text: BODY, example: { body_text: [["42"]] } },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
  console.log("Wait for APPROVED, then set Vercel env WHATSAPP_TEMPLATE_OTP=booking_code")
}

main().catch((e) => { console.error(e); process.exit(1) })
