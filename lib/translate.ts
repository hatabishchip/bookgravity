// Lightweight translation + language-detection wrapper around Anthropic's
// Claude API. Used by the WhatsApp inbox to:
//   1. Translate incoming client messages to the studio's admin language
//      (Studio.inboxLanguage) before showing them in the inbox.
//   2. Translate admin replies from the studio's language back to the
//      client's detected language before delivery via Cloud API.
//
// One round-trip handles both detect + translate, which keeps end-to-end
// latency well below the 5s webhook ack deadline.
//
// Required env:
//   ANTHROPIC_API_KEY  — owner's Anthropic API key (production only)
//   TRANSLATE_MODEL    — optional, defaults to a fast Haiku model
//
// All functions are best-effort: if the key is missing, the network fails,
// or the model returns garbage, we return ok:false and the caller falls
// back to displaying the original text.
//
// Hot-path defensive choices: short max_tokens cap, single shot (no
// retries), tiny prompt, JSON-only response so parsing is deterministic.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const DEFAULT_MODEL = "claude-haiku-4-5"

type TranslateOk = { ok: true; translated: string; sourceLang: string }
type TranslateErr = { ok: false; error: string }

/**
 * One-shot detect-then-translate. Returns the source language code AND the
 * translation in a single API call.
 *
 * If the source language already matches `targetLang`, returns the input
 * unchanged with `sourceLang === targetLang` so callers can skip storing a
 * redundant translatedBody.
 */
export async function translateAndDetect(opts: {
  text: string
  /** ISO 639-1 lowercase target language code (e.g. "ru", "en", "id"). */
  targetLang: string
}): Promise<TranslateOk | TranslateErr> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not set" }
  const text = opts.text.trim()
  if (!text) return { ok: false, error: "empty_text" }
  const target = opts.targetLang.toLowerCase().slice(0, 2)
  if (!/^[a-z]{2}$/.test(target)) return { ok: false, error: "bad_target_lang" }

  // Strict prompt: model returns ONLY a JSON object. We parse the first
  // {...} blob to tolerate the rare wrapping prose.
  const prompt =
    `You are a translation utility. Detect the language of the input, then translate it to ${target}.\n\n` +
    `If the input is already in ${target}, return it unchanged.\n` +
    `Preserve emoji, line breaks, names and numbers verbatim.\n` +
    `Do NOT add any commentary or explanations.\n\n` +
    `Respond with EXACTLY one JSON object on a single line, no markdown:\n` +
    `{"sourceLang":"<ISO 639-1 lowercase>","translation":"<translated text>"}\n\n` +
    `Input:\n${text}`

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.TRANSLATE_MODEL || DEFAULT_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    if (!r.ok) {
      const txt = (await r.text()).slice(0, 200)
      return { ok: false, error: `HTTP ${r.status}: ${txt}` }
    }
    const j = (await r.json()) as {
      content?: { type: string; text?: string }[]
    }
    const raw = j.content?.find((c) => c.type === "text")?.text?.trim() ?? ""
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return { ok: false, error: `no_json: ${raw.slice(0, 100)}` }
    let parsed: { sourceLang?: string; translation?: string }
    try {
      parsed = JSON.parse(m[0])
    } catch (err) {
      return { ok: false, error: `parse: ${err instanceof Error ? err.message : String(err)}` }
    }
    if (typeof parsed.translation !== "string" || !parsed.translation.length) {
      return { ok: false, error: "empty_translation" }
    }
    const sourceLang = (parsed.sourceLang ?? "").toLowerCase().slice(0, 2) || "und"
    return { ok: true, translated: parsed.translation, sourceLang }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
