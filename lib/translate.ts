// Translation + language-detection for the WhatsApp inbox:
//   1. Translate incoming client messages to the studio's admin language
//      (Studio.inboxLanguage) before showing them in the inbox.
//   2. Translate admin replies back to the client's detected language
//      before delivery via Cloud API.
//
// Multi-provider with automatic fallback, in priority order:
//   1. ANTHROPIC_API_KEY → Claude Haiku        (paid, best quality)
//   2. GEMINI_API_KEY     → Google Gemini Flash (free tier, real LLM) ⭐
//   3. GROQ_API_KEY       → Groq Llama/Qwen     (free tier, real LLM)
//        — may be a comma-separated list of keys; rotates on 429 to
//          multiply the free daily quota.
//   4. DEEPL_API_KEY      → DeepL               (free 500k chars/mo)
//   5. (nothing set)      → Google gtx endpoint (free, dictionary-grade)
//
// The first configured provider wins; if it errors at runtime we cascade
// to the next one so a transient outage never leaves a message untranslated.
//
// All functions are best-effort: on total failure we return ok:false and
// the caller falls back to displaying the original text.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_MODEL = "claude-haiku-4-5"
const GEMINI_MODEL = "gemini-2.5-flash"
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const GROQ_MODEL = "llama-3.3-70b-versatile"

// Short provider tag stored alongside each translation so the UI can show
// which engine produced it: "gem" Gemini, "gro" Groq, "cla" Claude,
// "dpl" DeepL, "goo" Google (dictionary).
export type TranslateProvider = "cla" | "gem" | "gro" | "dpl" | "goo"

type TranslateOk = {
  ok: true
  translated: string
  sourceLang: string
  provider: TranslateProvider
}
type TranslateErr = { ok: false; error: string }
type Result = TranslateOk | TranslateErr

/**
 * One-shot detect-then-translate. Returns the source language code AND the
 * translation. Picks the best configured provider and cascades on failure.
 *
 * If the source language already matches `targetLang`, providers are asked
 * to return the input unchanged with sourceLang === targetLang so callers
 * can skip storing a redundant translatedBody.
 */
export async function translateAndDetect(opts: {
  text: string
  /** ISO 639-1 lowercase target language code (e.g. "ru", "en", "zh"). */
  targetLang: string
}): Promise<Result> {
  const text = opts.text.trim()
  if (!text) return { ok: false, error: "empty_text" }
  const target = opts.targetLang.toLowerCase().slice(0, 2)
  if (!/^[a-z]{2}$/.test(target)) return { ok: false, error: "bad_target_lang" }

  // Build the provider chain from whatever keys are present, best-first.
  const chain: Array<() => Promise<Result>> = []
  if (process.env.ANTHROPIC_API_KEY) chain.push(() => viaClaude(text, target))
  if (process.env.GEMINI_API_KEY) chain.push(() => viaGemini(text, target))
  if (process.env.GROQ_API_KEY) chain.push(() => viaGroq(text, target))
  if (process.env.DEEPL_API_KEY) chain.push(() => viaDeepL(text, target))
  // Keyless free endpoint is always the last resort.
  chain.push(() => translateViaGoogleFree(text, target))

  let lastErr = "no_provider"
  for (const run of chain) {
    try {
      const r = await run()
      if (r.ok) return r
      lastErr = r.error
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
    // fall through to the next provider
  }
  return { ok: false, error: lastErr }
}

// ---------------------------------------------------------------------------
// Shared prompt — conversational WhatsApp translation for a studio inbox.
// ---------------------------------------------------------------------------
function buildPrompt(text: string, target: string): string {
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

/** Pull the first {...} JSON blob out of an LLM response into our shape. */
function parseLlmJson(raw: string, provider: TranslateProvider): Result {
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
  return { ok: true, translated: parsed.translation, sourceLang, provider }
}

// ---------------------------------------------------------------------------
// Provider: Anthropic Claude (paid, best quality)
// ---------------------------------------------------------------------------
async function viaClaude(text: string, target: string): Promise<Result> {
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.TRANSLATE_MODEL || ANTHROPIC_MODEL,
      max_tokens: 2048,
      temperature: 0.2,
      messages: [{ role: "user", content: buildPrompt(text, target) }],
    }),
  })
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200)
    return { ok: false, error: `claude HTTP ${r.status}: ${t}` }
  }
  const j = (await r.json()) as { content?: { type: string; text?: string }[] }
  const raw = j.content?.find((c) => c.type === "text")?.text?.trim() ?? ""
  return parseLlmJson(raw, "cla")
}

// ---------------------------------------------------------------------------
// Provider: Google Gemini Flash (free tier, real LLM) ⭐ recommended
// ---------------------------------------------------------------------------
async function viaGemini(text: string, target: string): Promise<Result> {
  const apiKey = process.env.GEMINI_API_KEY!
  const model = process.env.TRANSLATE_MODEL_GEMINI || GEMINI_MODEL
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(text, target) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
  })
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200)
    return { ok: false, error: `gemini HTTP ${r.status}: ${t}` }
  }
  const j = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const raw =
    j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? ""
  return parseLlmJson(raw, "gem")
}

// ---------------------------------------------------------------------------
// Provider: Groq (free tier, OpenAI-compatible, Llama/Qwen)
//
// GROQ_API_KEY may hold MULTIPLE comma-separated keys. We try them in order
// and rotate to the next one on a rate-limit (429) or transient 5xx, which
// effectively multiplies the free daily quota by the number of keys.
// ---------------------------------------------------------------------------
async function viaGroq(text: string, target: string): Promise<Result> {
  const keys = (process.env.GROQ_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
  if (keys.length === 0) return { ok: false, error: "groq_no_key" }

  let lastErr = "groq_unknown"
  for (const apiKey of keys) {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.TRANSLATE_MODEL_GROQ || GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildPrompt(text, target) }],
      }),
    })
    if (r.ok) {
      const j = (await r.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const raw = j.choices?.[0]?.message?.content?.trim() ?? ""
      return parseLlmJson(raw, "gro")
    }
    const t = (await r.text()).slice(0, 200)
    lastErr = `groq HTTP ${r.status}: ${t}`
    // Rotate to the next key only when it's worth retrying (quota / transient).
    if (r.status !== 429 && r.status < 500) break
  }
  return { ok: false, error: lastErr }
}

// ---------------------------------------------------------------------------
// Provider: DeepL (free 500k chars/mo). Two calls: detect+translate in one
// since DeepL auto-detects and returns the source lang.
// ---------------------------------------------------------------------------
async function viaDeepL(text: string, target: string): Promise<Result> {
  const apiKey = process.env.DEEPL_API_KEY!
  // Free keys end in ":fx" and use the free host; pro keys use the main host.
  const host = apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com"
  // DeepL target codes are upper-case and a couple are region-specific.
  const tl = deeplTarget(target)
  const body = new URLSearchParams()
  body.set("text", text)
  body.set("target_lang", tl)
  const r = await fetch(`${host}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  })
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200)
    return { ok: false, error: `deepl HTTP ${r.status}: ${t}` }
  }
  const j = (await r.json()) as {
    translations?: { detected_source_language?: string; text?: string }[]
  }
  const first = j.translations?.[0]
  if (!first?.text) return { ok: false, error: "deepl_empty" }
  const sourceLang =
    (first.detected_source_language ?? "").toLowerCase().slice(0, 2) || "und"
  return { ok: true, translated: first.text, sourceLang, provider: "dpl" }
}

function deeplTarget(twoLetter: string): string {
  // Most DeepL targets are just the upper-case 2-letter code; a few need
  // a region. We map the ones our studios use; default upper-case otherwise.
  const map: Record<string, string> = {
    en: "EN-US",
    pt: "PT-PT",
    zh: "ZH", // DeepL accepts ZH for Chinese (simplified)
  }
  return map[twoLetter] || twoLetter.toUpperCase()
}

// ---------------------------------------------------------------------------
// Provider: Google gtx (keyless, free, dictionary-grade — last resort)
// ---------------------------------------------------------------------------
async function translateViaGoogleFree(
  text: string,
  target: string,
): Promise<Result> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}` +
    `&dt=t&q=${encodeURIComponent(text)}`
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
    if (!r.ok) {
      const body = (await r.text()).slice(0, 120)
      return { ok: false, error: `google HTTP ${r.status}: ${body}` }
    }
    // Shape: [ [ [translatedChunk, originalChunk, ...], ... ], null, "<srcLang>", ... ]
    const j = (await r.json()) as unknown
    const arr = j as [Array<[string, string]>, unknown, string]
    const segments = Array.isArray(arr?.[0]) ? arr[0] : []
    const translated = segments
      .map((seg) => (Array.isArray(seg) ? seg[0] ?? "" : ""))
      .join("")
    if (!translated.trim()) return { ok: false, error: "empty_translation" }
    const detected = typeof arr?.[2] === "string" ? arr[2] : "und"
    const sourceLang = detected.toLowerCase().slice(0, 2) || "und"
    return { ok: true, translated, sourceLang, provider: "goo" }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
