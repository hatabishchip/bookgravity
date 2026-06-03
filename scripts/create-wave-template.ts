// A one-tap "wave" opener for trainers. The trainer's 👋 button must work even
// when the 24h customer-service window is closed, so it has to be a
// Meta-approved template. The body is JUST the wave emoji — no text — so the
// client simply receives a 👋 (not a "Greetings, <name>!" sentence).
//
// Run:
//   DOTENV_CONFIG_PATH=.env.vercel npx tsx scripts/create-wave-template.ts

import "dotenv/config"

const WABA_ID = "1571637721189360"
const GRAPH = "https://graph.facebook.com/v21.0"

type T = { name: string; body: string }
const TEMPLATES: T[] = [
  { name: "wave", body: "👋" },
]

async function submit(token: string, t: T) {
  const r = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: t.name,
      language: "en",
      category: "UTILITY",
      components: [{ type: "BODY", text: t.body }],
    }),
  })
  const j = (await r.json()) as { id?: string; status?: string; error?: unknown }
  if (!r.ok) { console.error(`  ✗ ${t.name}:`, JSON.stringify(j.error ?? j)); return false }
  console.log(`  ✓ ${t.name}: id=${j.id} status=${j.status}`)
  return true
}

async function main() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) { console.error("WHATSAPP_ACCESS_TOKEN not set"); process.exit(1) }
  console.log("WABA:", WABA_ID, "\n— submitting wave …\n")
  for (const t of TEMPLATES) await submit(token, t)
}

main().catch((e) => { console.error(e); process.exit(1) })
