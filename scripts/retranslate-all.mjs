// Re-translate every existing inbox message through the AI provider chain
// (Gemini → Groq → Google), overwriting the old dictionary-grade Google
// translations. Run against the production Turso DB with the AI keys set:
//
//   GEMINI_API_KEY=... GROQ_API_KEY=...,... \
//   DATABASE_URL=... TURSO_AUTH_TOKEN=... \
//   node scripts/retranslate-all.mjs [--dry] [--force]
//
//   --dry    : show what would change, write nothing
//   --force  : re-translate even messages already tagged via an AI provider
//              (default: skip messages whose translatedVia is gem/gro/cla/dpl)
//
// Per studio we use that studio's inboxLanguage as the target. Inbound
// messages translate body → admin language; outbound messages keep their
// existing translatedBody (those were translated on send, source of truth
// is the admin's typed original) UNLESS --force.
//
// Rate-friendly: small concurrency, tiny delay between batches so we stay
// well under the Gemini 15 req/min free limit.

import { createClient } from "@libsql/client"

const DRY = process.argv.includes("--dry")
const FORCE = process.argv.includes("--force")
const GRAPH_GEMINI_MODEL = process.env.TRANSLATE_MODEL_GEMINI || "gemini-2.5-flash"
const GROQ_MODEL = process.env.TRANSLATE_MODEL_GROQ || "llama-3.3-70b-versatile"

const c = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

function buildPrompt(text, target) {
  return (
    `You are translating WhatsApp chat messages between a stretching/yoga ` +
    `studio and its clients. Detect the input language, then translate to ` +
    `${target}.\n\n` +
    `Rules:\n` +
    `- Translate naturally and fluently the way a polite native speaker would ` +
    `text — NOT a literal word-for-word gloss. Keep the tone friendly and warm.\n` +
    `- Preserve emoji, line breaks, @mentions, proper names, phone numbers, ` +
    `times, dates and prices EXACTLY as written.\n` +
    `- Keep it concise; match the register (casual stays casual).\n` +
    `- If the text is already in ${target}, return it unchanged.\n` +
    `- Output NOTHING but the JSON. No notes, no explanations.\n\n` +
    `Respond with EXACTLY one JSON object on a single line:\n` +
    `{"sourceLang":"<ISO 639-1 lowercase>","translation":"<translated text>"}\n\n` +
    `Input:\n${text}`
  )
}

function parseJson(raw) {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const p = JSON.parse(m[0])
    if (typeof p.translation !== "string" || !p.translation.length) return null
    return {
      translated: p.translation,
      sourceLang: (p.sourceLang ?? "").toLowerCase().slice(0, 2) || "und",
    }
  } catch {
    return null
  }
}

async function viaGemini(text, target) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GRAPH_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(text, target) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: "application/json" },
    }),
  })
  if (!r.ok) return null
  const j = await r.json()
  const raw = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? ""
  const parsed = parseJson(raw)
  return parsed ? { ...parsed, provider: "gem" } : null
}

async function viaGroq(text, target) {
  const keys = (process.env.GROQ_API_KEY || "").split(",").map((k) => k.trim()).filter(Boolean)
  for (const key of keys) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildPrompt(text, target) }],
      }),
    })
    if (r.ok) {
      const j = await r.json()
      const raw = j.choices?.[0]?.message?.content?.trim() ?? ""
      const parsed = parseJson(raw)
      if (parsed) return { ...parsed, provider: "gro" }
    }
    if (r.status !== 429 && r.status < 500) break
  }
  return null
}

async function translate(text, target) {
  return (await viaGemini(text, target)) || (await viaGroq(text, target)) || null
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

async function main() {
  // Map studioId → inboxLanguage.
  const studios = await c.execute(`SELECT id, slug, inboxLanguage FROM Studio WHERE inboxLanguage IS NOT NULL`)
  const langByStudio = new Map()
  for (const s of studios.rows) langByStudio.set(s.id, s.inboxLanguage)
  console.log("Studios with translation on:", [...langByStudio.entries()].map(([, l]) => l))

  // INBOUND text messages with a body, in those studios. We re-translate the
  // body into the admin language. Outbound messages are left as-is (their
  // source of truth is the admin's typed original, already correct).
  const rows = await c.execute(`
    SELECT m.id, m.body, m.translatedVia, m.direction, m.type, conv.studioId
    FROM "WhatsAppMessage" m
    JOIN "WhatsAppConversation" conv ON conv.id = m.conversationId
    WHERE m.direction = 'INBOUND'
      AND m.type = 'text'
      AND m.body IS NOT NULL AND length(trim(m.body)) > 0
  `)

  let processed = 0, updated = 0, skipped = 0, failed = 0
  for (const row of rows.rows) {
    const target = langByStudio.get(row.studioId)
    if (!target) { skipped++; continue }
    // Skip ones already done by a real AI provider unless --force.
    if (!FORCE && row.translatedVia && ["gem", "gro", "cla", "dpl"].includes(row.translatedVia)) {
      skipped++; continue
    }
    processed++
    const res = await translate(row.body, target)
    if (!res) { failed++; console.log("  FAIL:", String(row.body).slice(0, 40)); continue }
    const sameLang = res.sourceLang === target
    const translatedBody = sameLang ? null : res.translated
    if (DRY) {
      console.log(`  [${res.provider}] ${res.sourceLang}→${target}: ${String(row.body).slice(0, 30)} => ${String(translatedBody ?? "(same)").slice(0, 40)}`)
    } else {
      await c.execute({
        sql: `UPDATE "WhatsAppMessage" SET translatedBody = ?, detectedLang = ?, translatedVia = ? WHERE id = ?`,
        args: [translatedBody, res.sourceLang, sameLang ? null : res.provider, row.id],
      })
    }
    updated++
    // Gentle pacing: ~8 req/sec max well under Gemini's 15/min if it routes there.
    await sleep(120)
  }

  console.log(`\nDone. candidates=${rows.rows.length} processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}${DRY ? " (dry-run, nothing written)" : ""}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
