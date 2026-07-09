// class_notice_v1 - the unified warm cancellation notice (owner-approved
// 09.07.2026). Sent to every confirmed client when a class is cancelled or
// the trainer can't teach it. One template for all cancel reasons.
//
//   {{1}} = client first name, {{2}} = class label ("Friday, Jul 11, 09:00")
//   URL button "Book another day" -> https://bookgravity.com/{{1}} (studio slug)
//
// After Meta approves: set WHATSAPP_TEMPLATE_CLASS_CANCELLED=class_notice_v1
// in Vercel env - lib/class-cancel.ts picks it up with zero code changes
// (until then it falls back to the already-approved booking_canceled).
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-class-notice-template.ts

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "class_notice_v1"

const BODY =
  "Hi {{1}}, sorry - your class on {{2}} has to be cancelled. " +
  "Tap below to pick any other day that suits you. We'll be glad to see you!"

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
          example: { body_text: [["Anna", "Friday, Jul 11, 09:00"]] },
        },
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: "Book another day",
              url: "https://bookgravity.com/{{1}}",
              example: ["https://bookgravity.com/canggu"],
            },
          ],
        },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
