// Conversation-opener greetings, used to message a client who hasn't written
// first (re-opens the 24h window). Two variants because a WhatsApp template
// variable can't be empty:
//   greeting_named — "Greetings, {{1}}! ..."  (client has a saved name)
//   greeting       — "Greetings! ..."          (no name)
//
// No city in the header/body so it's studio-neutral (works for any studio's
// own WABA).
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-greeting-templates.ts

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"

const TAIL =
  "This is Gravity Stretching. We're here if you have any questions about " +
  "your classes or booking — just reply to this message."

type T = { name: string; body: string; example?: string[] }
const TEMPLATES: T[] = [
  { name: "greeting", body: `Greetings! 🌿\n\n${TAIL}` },
  { name: "greeting_named", body: `Greetings, {{1}}! 🌿\n\n${TAIL}`, example: ["Anna"] },
]

async function submit(token: string, t: T) {
  const body: Record<string, unknown> = { type: "BODY", text: t.body }
  if (t.example) body.example = { body_text: [t.example] }
  const r = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: t.name, language: "en", category: "UTILITY", components: [body] }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error(`  ✗ ${t.name}:`, JSON.stringify(j.error ?? j)); return false }
  console.log(`  ✓ ${t.name}: id=${j.id} status=${j.status}`)
  return true
}

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) { console.error("WHATSAPP_ACCESS_TOKEN not set"); process.exit(1) }
  console.log("WABA:", WABA_ID, "\n— submitting greetings …\n")
  for (const t of TEMPLATES) await submit(token, t)
}

main().catch((e) => { console.error(e); process.exit(1) })
