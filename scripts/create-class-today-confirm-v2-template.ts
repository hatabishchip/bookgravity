// class_today_confirm_v2 — same-day "still coming?" check-in WITH the studio's
// Google Maps location as the last line. Owner-approved (buttons, 13.06.2026).
// Body is byte-identical to v1 plus a "📍 Location:\n{{1}}" footer.
//   {{1}} = the booking studio's locationUrl (per-studio, no mix-up).
//
// Run: cd bookgravity && WHATSAPP_ACCESS_TOKEN=... npx tsx \
//   scripts/create-class-today-confirm-v2-template.ts
// After approval: set WHATSAPP_TEMPLATE_TODAY_CONFIRM_V2=class_today_confirm_v2.
import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "class_today_confirm_v2"

// Meta forbids a template ending on a variable, so the existing sign-off
// ("We'd love to see you on the mat! 🙏") moves BELOW the location line —
// location stays at the bottom, no new copy added.
const BODY =
  "Hello! 🌿\n\n" +
  "Just a gentle reminder about your class today — are you still able to join us?\n\n" +
  "📍 Location:\n{{1}}\n\n" +
  "We'd love to see you on the mat! 🙏"

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
          example: { body_text: [["https://maps.app.goo.gl/2c15nQsdKzEBREey9"]] },
        },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error("Failed:", JSON.stringify(j.error ?? j)); process.exit(2) }
  console.log(`✓ ${NAME}: id=${j.id} status=${j.status}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
