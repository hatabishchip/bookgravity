// Submit the three client-facing UTILITY templates used to reach clients
// OUTSIDE the 24h customer-service window:
//
//   reschedule_today      — "move you to today at {{1}}" (the 7 time buttons
//                            all map onto this one template via the variable)
//   reschedule_other_day  — group didn't fill, offer another day
//   confirm_group_booking — please confirm your group-class booking
//
// Run:
//   cd bookgravity && npx tsx scripts/create-reschedule-templates.ts
// (reads WHATSAPP_ACCESS_TOKEN from .env)
//
// After each is APPROVED, set in Vercel + .env:
//   WHATSAPP_TEMPLATE_RESCHEDULE_TODAY=reschedule_today
//   WHATSAPP_TEMPLATE_RESCHEDULE_OTHER_DAY=reschedule_other_day
//   WHATSAPP_TEMPLATE_CONFIRM_BOOKING=confirm_group_booking

import "dotenv/config"

const WABA_ID = "1571637721189360" // GravityStretchingСanggu production WABA
const GRAPH = "https://graph.facebook.com/v21.0"
const LANGUAGE = "en"

type Template = {
  name: string
  category: "UTILITY"
  body: string
  // Positional examples for {{1}}, {{2}}, … — omit when the body has no vars.
  example?: string[]
}

// Decorative greeting + trailer keep the body from starting/ending with a
// variable, which Meta rejects, and match our existing approved templates.
const TEMPLATES: Template[] = [
  {
    name: "reschedule_today",
    category: "UTILITY",
    body:
      "Hello! 🌿\n\n" +
      "Would it be convenient to reschedule you to today at {{1}}?\n\n" +
      "— Gravity Stretching",
    example: ["19:00"],
  },
  {
    name: "reschedule_other_day",
    category: "UTILITY",
    body:
      "Hello! 🌿\n\n" +
      "Would it be convenient to reschedule you to another day? " +
      "Today's group didn't reach more than 2 people.\n\n" +
      "— Gravity Stretching",
  },
  {
    name: "confirm_group_booking",
    category: "UTILITY",
    body:
      "Hello! 🌿\n\n" +
      "Please confirm your booking for the Gravity Stretching group class.\n\n" +
      "— Gravity Stretching",
  },
]

async function submit(token: string, t: Template) {
  const body: Record<string, unknown> = {
    type: "BODY",
    text: t.body,
  }
  if (t.example) {
    body.example = { body_text: [t.example] }
  }
  const r = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: t.name,
      language: LANGUAGE,
      category: t.category,
      components: [body],
    }),
  })
  const j = (await r.json()) as {
    id?: string
    status?: string
    category?: string
    error?: { message: string; error_user_msg?: string }
  }
  if (!r.ok) {
    console.error(`  ✗ ${t.name}: FAILED`, JSON.stringify(j.error ?? j))
    return false
  }
  console.log(`  ✓ ${t.name}: id=${j.id} status=${j.status} category=${j.category}`)
  return true
}

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    console.error("WHATSAPP_ACCESS_TOKEN env not set (.env)")
    process.exit(1)
  }
  console.log("WABA:", WABA_ID, "\n— submitting templates …\n")
  let ok = 0
  for (const t of TEMPLATES) {
    if (await submit(token, t)) ok++
  }
  console.log(
    `\nDone: ${ok}/${TEMPLATES.length} submitted.\n` +
      "Watch WhatsApp Manager → Message Templates for APPROVED, then set in Vercel:\n" +
      "  WHATSAPP_TEMPLATE_RESCHEDULE_TODAY=reschedule_today\n" +
      "  WHATSAPP_TEMPLATE_RESCHEDULE_OTHER_DAY=reschedule_other_day\n" +
      "  WHATSAPP_TEMPLATE_CONFIRM_BOOKING=confirm_group_booking",
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
