// class_reminder_v6 — same as v5 but "Please arrive 10 minutes early" is now
// its own paragraph (blank line before it). Owner-approved (buttons, 13.06.2026).
//   {{1}} = start time 12h ("11:00 am"), {{2}} = studio city ("Ubud").
// After approval: set WHATSAPP_TEMPLATE_CLASS_REMINDER_V5=class_reminder_v6
// (the v5 env switch already drives the v5/v6 code path).
import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "class_reminder_v6"

const BODY =
  "Good evening! 💖\n\n" +
  "You have Gravity Stretching class tomorrow at {{1}} in the {{2}} Studio.\n\n" +
  "Please arrive 10 minutes early"

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
        { type: "BODY", text: BODY, example: { body_text: [["11:00 am", "Ubud"]] } },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
