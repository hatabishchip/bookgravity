// client_reply_to_trainer — forwards a client's reply (to the same-day class
// reminder) to the class trainer's WhatsApp, so the trainer knows who's still
// coming. Two variables:
//   {{1}} = client name
//   {{2}} = the client's reply text (or a "[photo]"-style label for media)
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-client-reply-template.ts

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "client_reply_to_trainer"

const BODY =
  "💬 Reply from your client\n\n" +
  "{{1}} answered today's class reminder:\n\n" +
  "{{2}}\n\n" +
  "— Gravity Stretching"

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    console.error("WHATSAPP_ACCESS_TOKEN not set")
    process.exit(1)
  }
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
          example: { body_text: [["Anna", "Yes, see you soon! 🙏"]] },
        },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) {
    console.error("Failed:", JSON.stringify(j.error ?? j))
    process.exit(2)
  }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
