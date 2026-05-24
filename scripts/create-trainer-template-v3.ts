// Submit a new WhatsApp message template to Meta with the owner-specified
// body layout. After Meta approves it (usually 24-48h), point
// WHATSAPP_TEMPLATE_TRAINER_NOTIFICATION at "trainer_booking_v3" in Vercel
// env and the trainer-notify fallback (used outside the 24h customer window)
// will render exactly like the free-form text.
//
// Target rendered output:
//   New booking
//
//   Friday, 28 May
//   Time: 7:00-9:00
//   Booked 1/6: Anna, John
//
//   🌿 🧘‍♀️ 🌿 🧘‍♂️ 🌿
//
// Run:
//   WHATSAPP_ACCESS_TOKEN=... npx tsx scripts/create-trainer-template-v3.ts
//
// The script auto-discovers the WABA id from the phone number id, so the
// only required env is the access token. PHONE_NUMBER_ID is hardcoded to
// Canggu's production number (same value as set-wa-profile-picture.ts).

import "dotenv/config"

const PHONE_NUMBER_ID = "1163623746829979"
// Production WhatsApp Business Account ID = "GravityStretchingСanggu", the
// real one the +62 821-3130-468 number is attached to. Templates submitted
// here are what the booking flow uses in production.
//
// NB: There's a second WABA (1376456617641220 = "Test WhatsApp Business
// Account") that Meta auto-creates when you set up Cloud API through the
// developers portal. It's only used with the +1 555 test number — DO NOT
// submit production templates there, they're invisible to the real phone.
const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const TEMPLATE_NAME = "trainer_booking_v3"
const LANGUAGE = "en"
const CATEGORY = "UTILITY"

// Body uses 4 numbered variables. Decorative emoji trailer satisfies Meta's
// "no variable at end of body" rule and gives the body enough non-variable
// content to pass the variable-density check.
const BODY_TEXT =
  "New booking\n\n" +
  "{{1}}\n" +
  "Time: {{2}}\n" +
  "Booked {{3}}: {{4}}\n\n" +
  "🌿 🧘‍♀️ 🌿 🧘‍♂️ 🌿"

const BODY_EXAMPLE = [["Friday, 28 May", "7:00-9:00", "1/6", "Anna"]]

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    console.error("WHATSAPP_ACCESS_TOKEN env not set")
    process.exit(1)
  }

  console.log("  WABA:", WABA_ID)
  console.log(`  phone: ${PHONE_NUMBER_ID}`)

  console.log(`\n— submitting template "${TEMPLATE_NAME}" …`)
  const url = `${GRAPH}/${WABA_ID}/message_templates`
  const payload = {
    name: TEMPLATE_NAME,
    language: LANGUAGE,
    category: CATEGORY,
    components: [
      {
        type: "BODY",
        text: BODY_TEXT,
        example: { body_text: BODY_EXAMPLE },
      },
    ],
  }

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const j = (await r.json()) as {
    id?: string
    status?: string
    category?: string
    error?: { message: string; error_user_msg?: string }
  }

  if (!r.ok) {
    console.error("Failed to create template:", j)
    process.exit(2)
  }
  console.log("  id     :", j.id)
  console.log("  status :", j.status)
  console.log("  category:", j.category)

  console.log(
    "\nDone. Wait ~24-48h for Meta approval, then in Vercel env:\n" +
      `  WHATSAPP_TEMPLATE_TRAINER_NOTIFICATION=${TEMPLATE_NAME}\n` +
      "and trigger a redeploy. Template fallback will use the new layout.",
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
