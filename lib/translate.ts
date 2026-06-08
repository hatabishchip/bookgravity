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
  const text = opts.text.trim()
  if (!text) return { ok: false, error: "empty_text" }
  const target = opts.targetLang.toLowerCase().slice(0, 2)
  if (!/^[a-z]{2}$/.test(target)) return { ok: false, error: "bad_target_lang" }

  // No Anthropic key configured → use the free, keyless Google endpoint so
  // translation works out of the box. (If a key is later added, we use Claude
  // below for higher quality.)
  if (!apiKey) return translateViaGoogleFree(text, target)

  // Conversational translation prompt. This is a WhatsApp chat between a
  // yoga/stretching studio and its clients, so we want NATURAL, fluent,
  // polite messaging — not a stiff word-for-word gloss. The model returns
  // ONLY a JSON object; we parse the first {...} blob to tolerate any prose.
  const prompt =
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
        // Low temperature → consistent, faithful translations.
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    if (!r.ok) {
      const txt = (await r.text()).slice(0, 200)
      console.warn(`[translate] Claude HTTP ${r.status}: ${txt} — falling back to Google`)
      // Don't fail the whole translation just because Claude hiccupped
      // (rate limit, transient 5xx) — the free endpoint still produces a
      // usable result so the admin never sees an untranslated message.
      return translateViaGoogleFree(text, target)
    }
    const j = (await r.json()) as {
      content?: { type: string; text?: string }[]
    }
    const raw = j.content?.find((c) => c.type === "text")?.text?.trim() ?? ""
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return translateViaGoogleFree(text, target)
    let parsed: { sourceLang?: string; translation?: string }
    try {
      parsed = JSON.parse(m[0])
    } catch {
      return translateViaGoogleFree(text, target)
    }
    if (typeof parsed.translation !== "string" || !parsed.translation.length) {
      return translateViaGoogleFree(text, target)
    }
    const sourceLang = (parsed.sourceLang ?? "").toLowerCase().slice(0, 2) || "und"
    return { ok: true, translated: parsed.translation, sourceLang }
  } catch (err) {
    console.warn("[translate] Claude threw — falling back to Google:", err)
    return translateViaGoogleFree(text, target)
  }
}

// Free, keyless translation via Google's public "gtx" endpoint. No account or
// billing needed — good enough for a low-volume studio inbox. It auto-detects
// the source language and returns it. Caveats: it's an unofficial endpoint, so
// it can rate-limit under heavy use; for production-grade quality/volume, set
// ANTHROPIC_API_KEY and the Claude path above takes over automatically.
async function translateViaGoogleFree(
  text: string,
  target: string,
): Promise<TranslateOk | TranslateErr> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}` +
    `&dt=t&q=${encodeURIComponent(text)}`
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    if (!r.ok) {
      const body = (await r.text()).slice(0, 120)
      return { ok: false, error: `google HTTP ${r.status}: ${body}` }
    }
    // Response shape: [ [ [translatedChunk, originalChunk, ...], ... ], null, "<srcLang>", ... ]
    const j = (await r.json()) as unknown
    const arr = j as [Array<[string, string]>, unknown, string]
    const segments = Array.isArray(arr?.[0]) ? arr[0] : []
    const translated = segments.map((seg) => (Array.isArray(seg) ? seg[0] ?? "" : "")).join("")
    if (!translated.trim()) return { ok: false, error: "empty_translation" }
    const detected = typeof arr?.[2] === "string" ? arr[2] : "und"
    const sourceLang = detected.toLowerCase().slice(0, 2) || "und"
    return { ok: true, translated, sourceLang }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
