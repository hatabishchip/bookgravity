// Submit `class_reminder_v5` — the current day-before reminder.
//
// Supersedes v4. Owner-approved wording (БЫЛО→СТАНЕТ + buttons, 13.06.2026):
//   • No header — the studio is named INSIDE the body ("in the {{2}} Studio"),
//     so there's no separate "Gravity Stretching <city>" title to mismatch.
//   • Shows ONLY the start time {{1}} ("11:00 am"), not a range: class length
//     varies 75–90+ min, and an end time would risk collisions/confusion.
//   • 💖 instead of 🌿, shorter copy, "class" (not "group class") so it fits
//     every class type.
//
// Variables: {{1}} = start time 12h ("11:00 am"), {{2}} = studio city ("Ubud").
// The send time also moved to 19:00 Bali (vercel.json cron "0 11 * * *").
//
// Run:
//   cd bookgravity && WHATSAPP_ACCESS_TOKEN=... npx tsx \
//     scripts/create-class-reminder-v5-template.ts
//
// After approval: set WHATSAPP_TEMPLATE_CLASS_REMINDER_V5=class_reminder_v5
// in Vercel env + redeploy (the activate-* scheduled task does this). Until
// then the legacy v4 path keeps sending.

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "class_reminder_v5"

const BODY =
  "Good evening! 💖\n\n" +
  "You have Gravity Stretching class tomorrow at {{1}} in the {{2}} Studio.\n" +
  "Please arrive 10 minutes early"

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    console.error("WHATSAPP_ACCESS_TOKEN env not set")
    process.exit(1)
  }
  console.log(`— submitting "${NAME}" to WABA ${WABA_ID} …`)
  const r = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: NAME,
      language: "en",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text: BODY,
          example: { body_text: [["11:00 am", "Ubud"]] },
        },
      ],
    }),
  })
  const j = (await r.json()) as {
    id?: string
    status?: string
    error?: { message: string }
  }
  if (!r.ok) {
    console.error("Failed:", j)
    process.exit(2)
  }
  console.log("  id     :", j.id)
  console.log("  status :", j.status)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
