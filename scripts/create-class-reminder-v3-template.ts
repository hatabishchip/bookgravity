// Submit `class_reminder_v3` — the class-type-neutral sibling of
// class_reminder_v2. v2 hardcodes "group class" in the body, so it reads
// wrong for KIDS and PRIVATE bookings; v3 just says "a class". The
// day-before cron routes GROUP → v2, everything else → v3
// (see sendClassReminderWA in lib/whatsapp-messages.ts).
//
// Run:
//   cd bookgravity && WHATSAPP_ACCESS_TOKEN=... npx tsx \
//     scripts/create-class-reminder-v3-template.ts

import "dotenv/config"

const WABA_ID = "1571637721189360" // GravityStretchingСanggu production WABA
const GRAPH = "https://graph.facebook.com/v21.0"
const NAME = "class_reminder_v3"

const BODY =
  "Good evening! 🌿\n\n" +
  "A quick reminder from Gravity Stretching — you're booked for a class tomorrow at {{1}}.\n\n" +
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
        { type: "HEADER", format: "TEXT", text: "Gravity Stretching" },
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
  console.log("\nKIDS/PRIVATE reminders start flowing as soon as Meta approves.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
