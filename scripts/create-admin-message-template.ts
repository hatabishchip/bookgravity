// Submit the "admin_message" UTILITY template — used as an automatic
// fallback when the 24h customer-service window is closed and an admin
// still needs to write to a client. Without this template the admin's
// free-form text gets rejected by Meta with error 131047.
//
// Run:
//   cd bookgravity && WHATSAPP_ACCESS_TOKEN=... npx tsx \
//     scripts/create-admin-message-template.ts
//
// After approval set in Vercel:
//   WHATSAPP_TEMPLATE_ADMIN_MESSAGE=admin_message

import "dotenv/config"

const WABA_ID = "1571637721189360" // GravityStretchingСanggu production WABA
const GRAPH = "https://graph.facebook.com/v21.0"
const TEMPLATE_NAME = "admin_message"
const LANGUAGE = "en"
const CATEGORY = "UTILITY"

// Two variables to keep within Meta's density rules:
//   {{1}} = client name (or a neutral fallback like "there")
//   {{2}} = the admin's actual text
// Decorative emoji trailer satisfies "no variable at end of body".
const BODY_TEXT =
  "Hello {{1}}! 🌿\n\n" +
  "{{2}}\n\n" +
  "— Gravity Stretching"

const BODY_EXAMPLE = [
  [
    "Anna",
    "Hi, just confirming your booking for tomorrow's 7am stretching class. See you soon!",
  ],
]

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    console.error("WHATSAPP_ACCESS_TOKEN env not set")
    process.exit(1)
  }
  console.log("  WABA:", WABA_ID)
  console.log(`\n— submitting "${TEMPLATE_NAME}" …`)

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
      `  WHATSAPP_TEMPLATE_ADMIN_MESSAGE=${TEMPLATE_NAME}\n` +
      "and redeploy. Admins will then be able to message clients at any time.",
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
