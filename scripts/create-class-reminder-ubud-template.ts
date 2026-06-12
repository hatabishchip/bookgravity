// Submit `class_reminder_ubud` — Ubud's own branded day-before reminder.
//
// Why: class_reminder_v2 hardcodes the header "Gravity Stretching Canggu".
// Templates are WABA-level (shared by every studio's number), so the first
// day Ubud clients got reminders they saw a Canggu header and panicked about
// which studio they'd booked. Owner picked per-studio branded templates over
// a single neutral one (12.06.2026, buttons).
//
// Body is IDENTICAL to v2 — only the header city changes. Approved by the
// owner via the БЫЛО→СТАНЕТ comparison before submission (template rule in
// ~/.claude/CLAUDE.md).
//
// Run:
//   cd bookgravity && WHATSAPP_ACCESS_TOKEN=... npx tsx \
//     scripts/create-class-reminder-ubud-template.ts
//
// After approval: set WHATSAPP_TEMPLATE_CLASS_REMINDER_UBUD=class_reminder_ubud
// in Vercel env + redeploy. Until then Ubud keeps sending v2 (wrong header,
// but DELIVERED — a failed send would be worse than a mislabeled one).

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "class_reminder_ubud"

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
        { type: "HEADER", format: "TEXT", text: "Gravity Stretching Ubud" },
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
  console.log(
    "\nAfter APPROVED: vercel env add WHATSAPP_TEMPLATE_CLASS_REMINDER_UBUD" +
      " (= class_reminder_ubud) + redeploy.",
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
