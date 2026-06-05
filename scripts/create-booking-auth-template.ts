// booking_auth_code — WhatsApp AUTHENTICATION template for the booking OTP.
// Meta renders the code prominently in the notification + a one-tap "Copy code"
// button, with no marketing text. Body text is fixed by Meta ("{{1}} is your
// verification code.").
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-booking-auth-template.ts
//
// After APPROVED, set in Vercel:
//   WHATSAPP_TEMPLATE_OTP_AUTH=booking_auth_code

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "booking_auth_code"

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) { console.error("WHATSAPP_ACCESS_TOKEN not set"); process.exit(1) }
  const r = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: NAME,
      language: "en",
      category: "AUTHENTICATION",
      components: [
        { type: "BODY", add_security_recommendation: false },
        { type: "FOOTER", code_expiration_minutes: 10 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
  console.log("Wait for APPROVED, then set Vercel env WHATSAPP_TEMPLATE_OTP_AUTH=booking_auth_code")
}

main().catch((e) => { console.error(e); process.exit(1) })
