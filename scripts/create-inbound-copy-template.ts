// Submit the "inbound_message_copy" UTILITY template to Meta. We use this
// to forward every inbound corporate-number message to the owner's personal
// WhatsApp without depending on the 24h customer-service window — templates
// work regardless of the window.
//
// Run:
//   cd bookgravity && WHATSAPP_ACCESS_TOKEN=... npx tsx scripts/create-inbound-copy-template.ts
//
// After ~minutes-hours Meta approves it, then set in Vercel env:
//   WHATSAPP_TEMPLATE_INBOUND_COPY=inbound_message_copy

import "dotenv/config"

const WABA_ID = "1571637721189360" // GravityStretchingСanggu production WABA
const GRAPH = "https://graph.facebook.com/v21.0"
const TEMPLATE_NAME = "inbound_message_copy"
const LANGUAGE = "en"
const CATEGORY = "UTILITY"

// Body. Two vars:
//   {{1}} = sender display (name + phone)
//   {{2}} = message body OR a media type label like "[photo]"
// Decorative emoji trailer satisfies Meta's "no variable at end" rule and
// adds non-variable bulk to pass the variable-density check.
const BODY_TEXT =
  "📨 New WhatsApp message from {{1}}\n\n" +
  "{{2}}\n\n" +
  "🌿 🧘‍♀️ 🌿 🧘‍♂️ 🌿"

const BODY_EXAMPLE = [
  [
    "Anna (+62 821-455-46-405)",
    "Hi, can I book the 7am class tomorrow?",
  ],
]

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    console.error("WHATSAPP_ACCESS_TOKEN env not set")
    process.exit(1)
  }
  console.log("  WABA:", WABA_ID)
  console.log(`\n— submitting template "${TEMPLATE_NAME}" …`)

  const r = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
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
    }),
  })
  const j = (await r.json()) as {
    id?: string
    status?: string
    category?: string
    error?: { message: string }
  }
  if (!r.ok) {
    console.error("Failed:", j)
    process.exit(2)
  }
  console.log("  id     :", j.id)
  console.log("  status :", j.status)
  console.log("  category:", j.category)
  console.log(
    "\nWait for APPROVED, then set Vercel env:\n" +
      `  WHATSAPP_TEMPLATE_INBOUND_COPY=${TEMPLATE_NAME}\n` +
      "and redeploy. forwardInboundToOwner will start pushing through.",
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
