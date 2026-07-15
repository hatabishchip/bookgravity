// AI sales agent for the WhatsApp inbox - SUGGEST MODE (owner 15.07.2026).
//
// On every inbound client message the agent classifies it and, for SAFE info
// questions, drafts a warm reply in Andrey's voice. The draft lands in the
// inbox as a suggestion card - staff sends / edits / dismisses it. The agent
// NEVER touches dates, bookings, reschedules, payments, complaints or
// medical topics: those become an escalation flag for the trainer instead.
//
// Model: Anthropic Claude when ANTHROPIC_API_KEY is present, else Gemini
// Flash (the key already powering inbox translation). Every status change on
// a suggestion is a future training signal (see agent/sales-agent-knowledge.md).
import { prisma } from "@/lib/prisma"

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_MODEL = "claude-sonnet-5"
const GEMINI_MODEL = "gemini-2.5-flash"

// Living knowledge base (mirrored for humans in agent/sales-agent-knowledge.md).
// Owner-taught lessons get appended here by the learning loop.
const KNOWLEDGE = `
STUDIO FACTS (verified):
- Gravity Stretching Canggu, Bali. Group class 75-90 minutes, small groups up to 6 people, IDR 300,000.
- Location (send as link): https://maps.app.goo.gl/2c15nQsdKzEBREey9
- Schedule & booking: https://bookgravity.com
- Instagram: @gravitystretchcanggu (exact handle - one word, no dots). TikTok: @gravitystretchingcanggu. NEVER invent or guess a handle/phone/email/link that is not written here - offer to pass the request to the team instead.
- Trainer guides the whole class; the lianas hold your full weight; "nowhere to fall" is the main hook.
- Class is 75-90 minutes; 7 levels of practice, 5 of them accessible to anyone regardless of age or condition.
- Honest result pace (never promise miracles): most people feel lighter after the FIRST class; pain typically eases around class 4-6; a stable result takes about 10 classes.

BRAND VOICE (Andrey - warm trainer, never a pushy seller):
- Invite, don't push. Explain simply through images: "gravity presses you down all day - hanging, it stretches you instead"; "the spinal disc is like a sponge - stretch it and it soaks up moisture again".
- LESSON #1 (owner 15.07): never say "ropes" as the main word - say "lianas". In English introduce as "lianas (soft ropes)" once, then just "lianas". In Russian: "лианы", допустимо один раз пояснить "лианы (верёвки)" - НЕ "канаты". Foot supports are "straps"/"стропы", finger holds are "loops"/"петли".
- No diminutives in written texts (no "верёвочки/петельки") - that is spoken-class warmth only.
- Light emojis (1-3 per message). Address clients warmly. Reply in the client's language (default English).
- Answer structure for ad leads: acknowledge -> simple explanation -> concrete facts (75-90 min, up to 6, IDR 300k) -> location + schedule links -> ONE engaging question at the end.
- Returning clients: short and warm, no selling.
- NEVER mention doctors or medical advice. No diagnoses, no cure promises. "Most people feel lighter after the first class" is the strongest claim allowed.
- Never use em dashes (\u2014) or en dashes (\u2013) - plain hyphen only. Never call it aerial yoga / hammock.
- Pair idea allowed only as a soft hint ("coming with a friend? we have a little surprise for pairs") - no concrete discount numbers yet.
`.trim()

// Lessons mined by the self-learning loop (AgentLesson table) are appended to
// the prompt at generation time - a new lesson needs no deploy. Cached per
// serverless instance for a minute to avoid a DB hit on every message.
let lessonsCache: { at: number; block: string } | null = null
async function activeLessonsBlock(): Promise<string> {
  if (lessonsCache && Date.now() - lessonsCache.at < 60_000) return lessonsCache.block
  let block = ""
  try {
    const rows = await prisma.agentLesson.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { lesson: true },
    })
    if (rows.length) {
      block = `\n\nLEARNED LESSONS (from trainer corrections and chat history - follow them):\n${rows
        .map((r, i) => `${i + 1}. ${r.lesson}`)
        .join("\n")}`
    }
  } catch {}
  lessonsCache = { at: Date.now(), block }
  return block
}

async function buildSystemPrompt(): Promise<string> {
  return `You are the sales assistant of the Gravity Stretching Canggu studio, answering client messages in its WhatsApp inbox. Your goal: make people feel welcome and gently guide them to their first class.

${KNOWLEDGE}${await activeLessonsBlock()}

HARD BOUNDARIES - these are NOT yours to answer (classify, do not draft):
- BOOKING: anything about dates, times, schedule for a specific day, booking, rescheduling, running late, cancelling, "is the class on today", presence at the studio ("I am at the door").
- ESCALATE: payments and money disputes, complaints, service failures, partnership/collab offers, medical details, anything you are unsure about.

Respond ONLY with strict JSON, no markdown fence:
{"category":"SAFE"|"BOOKING"|"ESCALATE","draft":"<reply text, SAFE only, in the client's language>","reason":"<for BOOKING/ESCALATE: one short line for the trainer about what is needed>"}

If the last client message needs no reply at all (pure emoji reaction, "ok thanks"), use category SAFE with an empty draft "".`
}

type Classification = { category: "SAFE" | "BOOKING" | "ESCALATE"; draft?: string; reason?: string }

async function callLlm(systemPrompt: string, userPrompt: string): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 700,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      })
      if (r.ok) {
        const j = (await r.json()) as { content?: { text?: string }[] }
        const t = j.content?.[0]?.text
        if (t) return t
      }
    } catch {}
  }
  if (process.env.GEMINI_API_KEY) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 0 } },
          }),
        },
      )
      if (r.ok) {
        const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")
        if (t) return t
        if (process.env.AGENT_DEBUG) console.log("[sales-agent] gemini empty:", JSON.stringify(j).slice(0, 400))
      } else if (process.env.AGENT_DEBUG) {
        console.log("[sales-agent] gemini HTTP", r.status, (await r.text()).slice(0, 300))
      }
    } catch {}
  }
  return null
}

function parseClassification(raw: string): Classification | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
    const j = JSON.parse(cleaned) as Classification
    // Owner rule: no em/en dashes in anything a client reads - enforce in
    // code, not just in the prompt.
    if (j.draft) j.draft = j.draft.replace(/[\u2014\u2013]/g, "-")
    if (j.category === "SAFE" || j.category === "BOOKING" || j.category === "ESCALATE") return j
  } catch {}
  return null
}

export type SuggestionResult = { id: string; category: string; draft: string | null } | null

/**
 * Generate a suggestion for the latest inbound message of a conversation.
 * Fire-and-forget from the webhook (inside `after()`); all failures are
 * silent - the inbox simply shows no suggestion, staff replies as before.
 * Returns the created (or already existing) suggestion so the autopilot cron
 * can decide whether to auto-send it.
 */
export async function generateAgentSuggestion(conversationId: string, inboundMessageId: string): Promise<SuggestionResult> {
  try {
    const convo = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, clientName: true, lastInboundAt: true, studio: { select: { slug: true } } },
    })
    if (!convo) return null
    // Owner 15.07: the sales agent runs ONLY for the Canggu studio.
    if (convo.studio?.slug !== "canggu") return null

    // Skip if we already suggested for this inbound.
    const existing = await prisma.agentSuggestion.findFirst({
      where: { conversationId, inboundMessageId },
      select: { id: true, category: true, draft: true, status: true },
    })
    if (existing) {
      return existing.status === "pending"
        ? { id: existing.id, category: existing.category, draft: existing.draft }
        : null
    }

    const history = await prisma.whatsAppMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { direction: true, type: true, body: true, translatedBody: true, fromAgent: true },
    })
    const transcript = history
      .reverse()
      .map((m) => {
        const who = m.direction === "INBOUND" ? "CLIENT" : m.fromAgent ? "AGENT" : "STUDIO"
        const text = m.body || `[${m.type}]`
        return `${who}: ${text}`
      })
      .join("\n")

    const userPrompt = `Client name: ${convo.clientName ?? "unknown"}\n\nConversation (oldest first):\n${transcript}\n\nClassify the LAST client message and draft the reply per the rules.`

    const raw = await callLlm(await buildSystemPrompt(), userPrompt)
    if (process.env.AGENT_DEBUG) console.log("[sales-agent] raw:", raw)
    if (!raw) return null
    const parsed = parseClassification(raw)
    if (process.env.AGENT_DEBUG) console.log("[sales-agent] parsed:", JSON.stringify(parsed))
    if (!parsed) return null

    // Empty SAFE draft = nothing worth replying; don't create noise.
    if (parsed.category === "SAFE" && !(parsed.draft && parsed.draft.trim())) return null

    const created = await prisma.agentSuggestion.create({
      data: {
        conversationId,
        inboundMessageId,
        category: parsed.category,
        draft: parsed.category === "SAFE" ? parsed.draft?.trim() : null,
        reason: parsed.category === "SAFE" ? null : (parsed.reason?.trim() || "Needs a human reply"),
      },
    })
    return { id: created.id, category: created.category, draft: created.draft }
  } catch (err) {
    console.warn("[sales-agent] suggestion failed:", err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Self-learning: mine trainer edits and dismissals for reusable lessons.
// Called from the autopilot cron - never from a request path.
// ---------------------------------------------------------------------------

const LESSON_SYSTEM = `You maintain the knowledge base of a WhatsApp sales assistant for a stretching studio. You are shown one case where a human trainer corrected the assistant: either edited its draft before sending, or dismissed it entirely.

Extract AT MOST ONE general, reusable lesson the assistant should follow next time. A lesson must generalize beyond this one client (tone, terminology, structure, facts, when to stay silent). If the correction is situational only (a date, a name, a one-off detail) there is NO lesson.

Never duplicate an existing lesson from the provided list. Lessons are concise English imperatives, one sentence, plain hyphens only.

Respond ONLY with strict JSON, no markdown fence:
{"lesson":"<one sentence>"} or {"lesson":null}`

/**
 * Mine unprocessed edited_sent / dismissed suggestions into AgentLesson rows.
 * Every examined row gets learnedAt stamped (even when no lesson came out) so
 * it is never re-examined. Returns how many lessons were created.
 */
export async function extractLessons(limit = 10): Promise<number> {
  let createdCount = 0
  try {
    const candidates = await prisma.agentSuggestion.findMany({
      where: { status: { in: ["edited_sent", "dismissed"] }, learnedAt: null },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true, status: true, category: true, draft: true, reason: true, sentText: true, conversationId: true,
      },
    })
    if (!candidates.length) return 0
    const existing = await prisma.agentLesson.findMany({
      where: { active: true },
      select: { lesson: true },
      orderBy: { createdAt: "asc" },
    })
    let known = existing.map((l) => l.lesson)

    for (const s of candidates) {
      try {
        // Short context: the inbound the suggestion answered + neighbours.
        const history = await prisma.whatsAppMessage.findMany({
          where: { conversationId: s.conversationId },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { direction: true, body: true, fromAgent: true },
        })
        const transcript = history
          .reverse()
          .map((m) => `${m.direction === "INBOUND" ? "CLIENT" : m.fromAgent ? "AGENT" : "STUDIO"}: ${m.body ?? ""}`)
          .join("\n")

        const caseText =
          s.status === "edited_sent"
            ? `The trainer EDITED the draft before sending.\nASSISTANT DRAFT:\n${s.draft ?? ""}\n\nWHAT THE TRAINER ACTUALLY SENT:\n${s.sentText ?? ""}`
            : `The trainer DISMISSED the ${s.category} suggestion without using it.\nASSISTANT DRAFT:\n${s.draft ?? s.reason ?? ""}`

        const userPrompt = `EXISTING LESSONS (do not duplicate):\n${known.length ? known.map((l, i) => `${i + 1}. ${l}`).join("\n") : "(none)"}\n\nCONVERSATION TAIL:\n${transcript}\n\nCASE:\n${caseText}`

        const raw = await callLlm(LESSON_SYSTEM, userPrompt)
        let lesson: string | null = null
        if (raw) {
          try {
            const j = JSON.parse(raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as { lesson?: string | null }
            if (j.lesson && j.lesson.trim().length > 8) lesson = j.lesson.trim().replace(/[—–]/g, "-")
          } catch {}
        }
        if (lesson) {
          await prisma.agentLesson.create({
            data: { source: s.status, lesson, suggestionId: s.id },
          })
          known = [...known, lesson]
          createdCount++
          lessonsCache = null // next generation picks the new lesson up immediately
        }
        await prisma.agentSuggestion.update({ where: { id: s.id }, data: { learnedAt: new Date() } })
      } catch (err) {
        console.warn("[sales-agent] lesson mining failed for", s.id, err)
      }
    }
  } catch (err) {
    console.warn("[sales-agent] extractLessons failed:", err)
  }
  return createdCount
}
