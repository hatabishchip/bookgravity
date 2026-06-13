// Submit `class_reminder_v4` — the studio-variable day-before reminder.
//
// Why: class_reminder_v2 hardcodes "Gravity Stretching Canggu" in its header
// and templates are WABA-level (shared by every studio's number) — Ubud
// clients saw a Canggu header and one even cancelled her (only) Ubud booking
// over it (Yasuko, 13.06.2026). Cloning a template per studio scales badly,
// so v4 puts the city in a HEADER VARIABLE: "Gravity Stretching {{1}}".
// One template serves every present and future studio, correctly branded.
//
// Body is byte-identical to v2. Owner approved the header change via
// buttons on 13.06.2026 (client-text rule in ~/.claude/CLAUDE.md).
//
// Run:
//   cd bookgravity && WHATSAPP_ACCESS_TOKEN=... npx tsx \
//     scripts/create-class-reminder-v4-template.ts
//
// After approval: set WHATSAPP_TEMPLATE_CLASS_REMINDER_STUDIO_VAR=
// class_reminder_v4 in Vercel env + redeploy (the scheduled task
// `activate-ubud-reminder-template` does this automatically). Until then
// GROUP reminders keep the legacy path (v2 / per-slug clone).

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "class_reminder_v4"

const BODY =
  "Good evening! 🌿\n\n" +
  "A quick reminder from Gravity Stretching — you're booked for a group class tomorrow at {{1}}.\n\n" +
  "Please arrive 10 minutes early so we can start comfortably. See you there! 🙏"

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
          type: "HEADER",
          format: "TEXT",
          text: "Gravity Stretching {{1}}",
          example: { header_text: ["Ubud"] },
        },
        {
          type: "BODY",
          text: BODY,
          example: { body_text: [["11:00–12:30"]] },
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
