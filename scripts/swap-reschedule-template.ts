// Replace the time-reschedule template wording:
//   OLD reschedule_today: "...reschedule you to today at {{1}}?"
//   NEW reschedule_time:  "...reschedule at {{1}}?"   (no "you to today")
//
// Creates the new template (submits for approval) and deletes the old one.
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/swap-reschedule-template.ts

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"
const LANGUAGE = "en"

const NEW_NAME = "reschedule_time"
const OLD_NAME = "reschedule_today"

const NEW_BODY =
  "Hello! 🌿\n\n" +
  "Would it be convenient to reschedule at {{1}}?\n\n" +
  "— Gravity Stretching"

async function createNew(token: string) {
  console.log(`\n— submitting "${NEW_NAME}" …`)
  const r = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: NEW_NAME,
      language: LANGUAGE,
      category: "UTILITY",
      components: [
        { type: "BODY", text: NEW_BODY, example: { body_text: [["19:00"]] } },
      ],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) {
    console.error(`  ✗ create ${NEW_NAME}:`, JSON.stringify(j.error ?? j))
    return false
  }
  console.log(`  ✓ ${NEW_NAME}: id=${j.id} status=${j.status}`)
  return true
}

async function deleteOld(token: string) {
  console.log(`\n— deleting "${OLD_NAME}" …`)
  const r = await fetch(
    `${GRAPH}/${WABA_ID}/message_templates?name=${encodeURIComponent(OLD_NAME)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  )
  const j = (await r.json()) as { success?: boolean; error?: unknown }
  if (!r.ok) {
    console.error(`  ✗ delete ${OLD_NAME}:`, JSON.stringify(j.error ?? j))
    return false
  }
  console.log(`  ✓ deleted ${OLD_NAME}: success=${j.success}`)
  return true
}

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    console.error("WHATSAPP_ACCESS_TOKEN env not set")
    process.exit(1)
  }
  console.log("WABA:", WABA_ID)
  const created = await createNew(token)
  if (created) await deleteOld(token)
  console.log("\nDone. Wait for reschedule_time to become APPROVED.")
}

main().catch((e) => { console.error(e); process.exit(1) })
