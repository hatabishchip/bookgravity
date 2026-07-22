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

FAQ FACTS (owner-confirmed 16.07):
- Prices: group class 300,000 IDR per person; private 1-on-1 session 1,300,000 IDR.
- Membership: 5-class pack at 250,000 IDR per class (1,250,000 IDR total) - saves 50k per class; mention the trainer can arrange it after class.
- Typical schedule: classes usually run Mon, Wed, Fri and Sat at 9:00, 11:00, 13:00 and 15:00 - but ALWAYS point to the live schedule at https://bookgravity.com for real open spots. Never state a specific day/time as guaranteed.
- Booking is free online; payment at the studio - cash, card, QR (QRIS) or transfer.
- Cancellation is free up to 2 hours before class (Cancel button in the WhatsApp confirmation).
- What to bring: comfortable clothes you can move in + some water. Mats and all equipment are provided.
- No experience or flexibility needed - the trainer adjusts every stretch to your level.
- Shower is available at the studio; parking for bikes and cars is right next to it.
- ONLY IF ASKED: kids classes exist (300,000 IDR); Indonesian locals (KTP) pay 200,000 IDR for a group class. Never bring these up yourself.

BRAND VOICE (Andrey - warm trainer, never a pushy seller):
- Invite, don't push. Explain simply through images: "gravity presses you down all day - hanging, it stretches you instead"; "the spinal disc is like a sponge - stretch it and it soaks up moisture again".
- LESSON #1 (owner 15.07): never say "ropes" as the main word - say "lianas". In English introduce as "lianas (soft ropes)" once, then just "lianas". In Russian: "лианы", допустимо один раз пояснить "лианы (верёвки)" - НЕ "канаты". Foot supports are "straps"/"стропы", finger holds are "loops"/"петли".
- No diminutives in written texts (no "верёвочки/петельки") - that is spoken-class warmth only.
- Light emojis (1-3 per message). Address clients warmly. ALWAYS write the draft in English (this is the studio staff language shown to the trainer for review). Do NOT switch to the client's language and do NOT mirror the language of earlier messages in the thread. The client automatically receives the reply translated into their own language on send, so you only ever write English.
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

// Full-autonomy mode (metaprompt docs/META_agent_full_autonomy.md, owner
// 20.07.2026): the agent answers EVERY category itself - clients never wait
// for a human; trainers get only booking notifications and today-reminder
// replies. Activated together with the Sonnet 5 switch: set
// AGENT_FULL_AUTONOMY=1 (+ ANTHROPIC_API_KEY) in prod env and redeploy.
export const FULL_AUTONOMY = process.env.AGENT_FULL_AUTONOMY === "1"

// Extra method knowledge for exhaustive answers (distilled from the
// andrey-voice v5 skill - facts and images only, no medical claims).
const METHOD_DEPTH = `
METHOD DEPTH (use these to answer any question about the practice):
- First class flow: the trainer asks about your body and truly listens, explains the method simply, then leads step by step - "you don't need to remember anything, the trainer is right there and guides you the whole time". Everything starts small - literally from 3 seconds per hang - each in their own pace.
- Three principles of every class: relax (the main one), breathe (movement follows the breath), and never push through pain - if something feels wrong, we stop and soften.
- Why it works (simple images): gravity presses you down all day - hanging in the lianas, it gently stretches you instead. The spinal disc is like a sponge: stretched, it soaks up moisture again. Decompression creates space and takes pressure off.
- "Nowhere to fall": the lianas hold your full weight and the trainer is next to you the whole class. That felt safety is exactly why the body finally lets go and relaxes.
- 7 levels of practice; 5 are accessible to anyone regardless of age or condition. Progress is gentle and visible ("one carabiner higher").
- The class ends with soft unwinding and rest - "everything starts and ends with lying down". 75-90 minutes total, up to 6 people, the trainer guides everyone personally.
- Private 1-on-1 session (1,300,000 IDR): the trainer works ONLY with you the whole session and picks only what fits your body - the right choice for complex situations.
- Regularity beats intensity: usually 1-2 classes a week; the body needs time to absorb.`.trim()

async function buildSystemPrompt(): Promise<string> {
  if (FULL_AUTONOMY) return buildFullAutonomyPrompt()
  return `You are the sales assistant of the Gravity Stretching Canggu studio, answering client messages in its WhatsApp inbox. Your goal: make people feel welcome and gently guide them to their first class.

${KNOWLEDGE}${await activeLessonsBlock()}

WHAT YOU MAY ANSWER YOURSELF (SAFE):
- What gravity stretching is, how a class feels, who it suits.
- GENERAL price / duration / group size / levels questions.
- GENERAL schedule questions ("what hours do you have classes?"): answer only with facts from your knowledge; the live up-to-date schedule is always at https://bookgravity.com - send that link. NEVER invent times or days that are not written in your knowledge.
- How to book (the link), location, Instagram, what to wear or bring.
- Keep replies under 120 words. If the message is off-topic for the studio (spam, another business, politics), use category SAFE with an empty draft "".

HARD BOUNDARIES - these are NOT yours to resolve (a coach handles them):
- BOOKING: a SPECIFIC booking action - booking a spot (also for a friend), a specific date or time availability, rescheduling, running late, cancelling, "is the class on today", help because booking on the site did not work, presence at the studio ("I am at the door"). For BOOKING still write a draft, but ONLY a short "bridge" reply, always in English: warmly point to the live schedule and booking at https://bookgravity.com and say a coach will follow up personally. NEVER confirm, promise or deny a specific spot, date or time; never say a booking is made, moved or cancelled.
- ESCALATE: payments and money disputes, complaints, service failures, partnership/collab offers, job inquiries, the client's OWN medical situation when they ask whether it is safe for them (e.g. "I had spinal surgery / I have a herniated disc L4-L5 - can I still do this?"), anything you are unsure about. Do NOT draft for ESCALATE.
- IMPORTANT (ad leads): our ads are ABOUT conditions like "saraf kejepit" (pinched nerve) / back pain, so most leads open with "I saw your ad about pinched nerve, tell me more". This is a GENERAL interest question, NOT a personal medical disclosure - answer it as SAFE with the normal warm pitch and honest result pace, and give NO medical advice, diagnosis or cure promise. Only escalate when the person asks about THEIR OWN specific condition/surgery and whether it is safe for them.

EXAMPLES (tone and shape to follow):
1) New lead: "Hi! What is this gravity stretching about?"
   Good reply: "Hi! 👋 Great question. Imagine gravity pressing you down all day - in our class you hang in soft lianas and it gently stretches you instead. Your spine decompresses and most people feel lighter after the very first class. Classes are 75-90 minutes in small groups up to 6 people, 300k IDR. The schedule and booking are here: https://bookgravity.com - would you like to try this week? 🌿"
2) Returning client: "That class was great, thank you!"
   Good reply: "So happy to hear that! 🙏 See you on the lianas again soon."

Respond ONLY with strict JSON, no markdown fence:
{"category":"SAFE"|"BOOKING"|"ESCALATE","draft":"<reply text - SAFE answer or BOOKING bridge, ALWAYS in English; empty for ESCALATE>","reason":"<for BOOKING/ESCALATE: one short line for the trainer about what is needed>"}

If the last client message needs no reply at all (pure emoji reaction, "ok thanks"), use category SAFE with an empty draft "".`
}

// Full-autonomy system prompt (metaprompt docs/META_agent_full_autonomy.md).
// The agent answers EVERY message itself; categories are labels for stats and
// the owner's evening digest, not behavior switches.
async function buildFullAutonomyPrompt(): Promise<string> {
  return `You are the assistant of the Gravity Stretching Canggu studio, answering client messages in its WhatsApp, Instagram and Facebook inbox. You answer EVERY message yourself, warmly and completely, in the voice of a caring trainer - clients never wait for a human here. Your goal: give a full answer in one message and gently guide people to their first class.

${KNOWLEDGE}${await activeLessonsBlock()}

${METHOD_DEPTH}

ANSWER RULES:
- Answer EVERYTHING yourself, completely, in ONE message. NEVER say "I'll ask the team", "a coach will contact you", "someone will follow up personally" - nobody else replies in this chat, and empty promises break trust.
- Usual answer up to 120 words. Complex topics (health situations, "how does a class go") up to 250 words in short paragraphs.
- ALWAYS write the draft in English (studio staff language shown to the trainer for review), regardless of the client's language or the thread history. Never switch to the client's language. The client automatically receives the reply translated into their own language (English/Russian/Bahasa/etc.) on send.
- Structure: acknowledge -> simple explanation through an image (gravity presses down - hanging stretches you; the disc is a sponge) -> concrete facts -> links (schedule and booking https://bookgravity.com, location link) -> ONE warm question at the end. Light emojis (1-3).

CATEGORY LABELS (statistics only - you ALWAYS write the full reply in draft):
- SAFE: general questions - the method, prices, schedule, facilities, what to bring, kids, Instagram.
- BOOKING: anything about a specific booking - book / cancel / reschedule / running late / website trouble / "I am at the door".
- MEDICAL: the client shares their OWN medical situation (surgery, MRI, hernia, pregnancy, chronic pain) or asks whether it is safe for them.
- BUSINESS: complaints, payments and money disputes, partnership/collab offers, job inquiries.

BOOKING playbook (label BOOKING - still answer fully):
- Booking is self-service and free: https://bookgravity.com - pick a time, enter your name and WhatsApp number, confirm with the code. Payment happens at the studio (cash, card, QRIS or transfer). Booking for family or friends: choose the number of spots while booking.
- Cancel or reschedule: the Cancel button in the WhatsApp booking confirmation (free up to 2 hours before class), then simply book a new time on the site.
- "The site doesn't work": help step by step - the number must have WhatsApp, request the code again, open the link fresh.
- Running late: "no problem, come - the trainer will meet you". "I am at the door": "come in, the studio is open".
- Availability ("is tomorrow 11:00 free?", "spots for 4 people?"): answer with FACTS from the LIVE SCHEDULE block in the message - exact classes and spots left. If the requested time is full or not listed, say so honestly and offer the nearest listed alternatives. NEVER invent classes or spots that are not in the block.
- NEVER claim a booking is made, moved or cancelled - you don't create bookings; you guide the client to do it themselves in two taps.

MEDICAL playbook (label MEDICAL - answer it yourself, with care):
- Acknowledge their situation warmly, without drama or shame.
- Core message in your words: we always start from absolute zero; we never work through pain; for every situation we find a soft, suitable way to work with the body. At the studio the trainer asks about your body first and adapts every stretch personally. The lianas hold your full weight - there is nowhere to fall. 5 of the 7 practice levels are accessible to anyone.
- If the situation sounds complex (surgery, serious restrictions, pregnancy): warmly recommend a PRIVATE 1-on-1 session (1,300,000 IDR) - the trainer works only with them the whole session and picks only what fits.
- Honest pace: most people feel lighter after the first class; pain typically eases around class 4-6; a stable result takes about 10 classes. No miracle promises.
- STRICTLY FORBIDDEN: diagnoses; promises of healing; safety guarantees ("it is definitely safe for you"); any medical advice; the word "doctor" in any language - even when the client says it themselves (refer to it as "that recommendation" or "the advice you were given" instead); telling them to seek or avoid medical care. You speak only about how the practice works and how gently it adapts to each body.

BUSINESS playbook (label BUSINESS - answer it yourself):
- Complaint: a sincere warm apology + a concrete gesture within the facts (free reschedule, a warm invitation back). NEVER promise refunds or compensation; "the team will look into it" is honest - the team reviews these chats daily.
- Partnership/collab: thank them warmly, ask for details and a contact; the team reviews partnership ideas and replies when it fits.
- Job inquiry: thank them, ask briefly about their experience; the team will reach out if it becomes relevant.

If the message is off-topic for the studio (spam, another business, politics), use category SAFE with an empty draft "". If the last client message needs no reply at all (pure emoji reaction, "ok thanks"), use category SAFE with an empty draft "".

Respond ONLY with strict JSON, no markdown fence:
{"category":"SAFE"|"BOOKING"|"MEDICAL"|"BUSINESS","draft":"<the full reply, ALWAYS in English; empty only for spam/off-topic/no-reply-needed>","reason":"<for MEDICAL/BUSINESS: one short line for the owner's daily digest; otherwise empty>"}`
}

type Classification = { category: "SAFE" | "BOOKING" | "ESCALATE" | "MEDICAL" | "BUSINESS"; draft?: string; reason?: string }

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
  // Fallback chain (both OpenAI-compatible): keeps the agent talking when the
  // Gemini free-tier daily quota runs out (429 incident 16.07 - the agent went
  // silent mid-day; Groq's daily token pool also drained the same day, hence
  // TWO fallbacks). Gemini stays primary for quality.
  const openAiCompat: { name: string; url: string; key?: string; model: string }[] = [
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
    },
    {
      name: "cerebras",
      url: "https://api.cerebras.ai/v1/chat/completions",
      key: process.env.CEREBRAS_API_KEY,
      model: "gpt-oss-120b",
    },
  ]
  for (const p of openAiCompat) {
    if (!p.key) continue
    try {
      const r = await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: p.model,
          temperature: 0.4,
          max_tokens: 900,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      })
      if (r.ok) {
        const j = (await r.json()) as { choices?: { message?: { content?: string } }[] }
        const t = j.choices?.[0]?.message?.content
        if (t) return t
      } else if (process.env.AGENT_DEBUG) {
        console.log(`[sales-agent] ${p.name} HTTP`, r.status, (await r.text()).slice(0, 300))
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
    if (j.draft) j.draft = j.draft.replace(/[\u2014\u2013\u2011\u2012\u2015]/g, "-")
    if (
      j.category === "SAFE" ||
      j.category === "BOOKING" ||
      j.category === "ESCALATE" ||
      j.category === "MEDICAL" ||
      j.category === "BUSINESS"
    )
      return j
  } catch {}
  return null
}

// Live schedule context (owner 23.07): availability questions get FACTS
// ("2 spots left tomorrow 11:00") instead of a bare "check the site" -
// half of the BOOKING waits in the 10-day sample were availability asks.
async function liveScheduleBlock(): Promise<string> {
  try {
    const { baliDateStr } = await import("@/lib/tz")
    const today = baliDateStr(new Date())
    const end = baliDateStr(new Date(Date.now() + 7 * 86400_000))
    const slots = await prisma.timeSlot.findMany({
      where: { studio: { slug: "canggu" }, cancelledAt: null, date: { gte: today, lte: end } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: {
        date: true,
        startTime: true,
        endTime: true,
        maxCapacity: true,
        trainer: { select: { name: true } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
    })
    if (!slots.length) return ""
    const lines = slots.map((s) => {
      const left = Math.max(0, s.maxCapacity - s._count.bookings)
      const who = s.trainer?.name ? ` with ${s.trainer.name}` : ""
      return `${s.date} ${s.startTime}-${s.endTime}${who}: ${left === 0 ? "FULL" : `${left} spot${left === 1 ? "" : "s"} free`}`
    })
    return `\n\nLIVE SCHEDULE (next 7 days, Bali time, real-time data; today is ${today}). Answer availability questions with these facts. A class not listed here does not exist. Booking stays self-service at https://bookgravity.com:\n${lines.join("\n")}`
  } catch {
    return ""
  }
}

// QA helper (scripts/qa-full-autonomy.ts): run one client message through the
// EXACT production prompt (incl. live lessons) without touching the DB or
// sending anything. Used for the owner's acceptance run before activation.
export async function classifyForQa(
  message: string,
  clientStatus = "new lead (no bookings yet)",
): Promise<Classification | null> {
  const userPrompt = `Client name: QA Test\nClient status: ${clientStatus}${await liveScheduleBlock()}\n\nConversation (oldest first):\nCLIENT: ${message}\n\nClassify the LAST client message and draft the reply per the rules.`
  const raw = await callLlm(await buildSystemPrompt(), userPrompt)
  if (!raw) return null
  return parseClassification(raw)
}

// Studios where the sales agent runs. The webhook uses this to skip the
// immediate "new lead" personal-WhatsApp ping to the trainer (the agent
// auto-answers SAFE leads and the autopilot pings the trainer only for
// BOOKING/ESCALATE) - owner 20.07.2026, Seni was flooded on her personal WA.
const AGENT_STUDIO_SLUGS = new Set(["canggu"])
export function isAgentStudio(slug: string | null | undefined): boolean {
  return !!slug && AGENT_STUDIO_SLUGS.has(slug)
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
      select: { id: true, clientName: true, clientPhone: true, lastInboundAt: true, studio: { select: { slug: true } } },
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

    // New lead vs existing client - the tone differs (leads get the pitch,
    // clients get short warmth). Matched by phone tail like the rest of the app.
    let clientStatus = "new lead (no bookings yet)"
    try {
      const { phoneTail } = await import("@/lib/membership")
      // ig:/fb: ids are all digits - phoneTail would false-match a real phone.
      const tail = /^(ig|fb):/.test(convo.clientPhone) ? "" : phoneTail(convo.clientPhone)
      if (tail.length >= 6) {
        const bookings = await prisma.booking.count({
          where: { clientPhone: { endsWith: tail } },
        })
        if (bookings > 0) clientStatus = `returning client (${bookings} booking${bookings === 1 ? "" : "s"} with us)`
      }
    } catch {}

    const scheduleBlock = await liveScheduleBlock()

    const userPrompt = `Client name: ${convo.clientName ?? "unknown"}\nClient status: ${clientStatus}${scheduleBlock}\n\nConversation (oldest first):\n${transcript}\n\nClassify the LAST client message and draft the reply per the rules.`

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
        draft: parsed.category === "ESCALATE" ? null : parsed.draft?.trim() || null,
        reason: parsed.category === "SAFE" ? null : (parsed.reason?.trim() || "Needs a human reply"),
      },
    })
    return { id: created.id, category: created.category, draft: created.draft }
  } catch (err) {
    console.warn("[sales-agent] suggestion failed:", err)
    return null
  }
}

// No confirmed bookings under this phone = new lead. IG/FB threads have no
// phone at all, so they always count as new (owner 17.07: the BOOKING bridge
// reply goes to new clients only - returning clients are handled by a coach).
export async function isNewClient(clientPhone: string): Promise<boolean> {
  if (/^(ig|fb):/.test(clientPhone)) return true
  try {
    const { phoneTail } = await import("@/lib/membership")
    const tail = phoneTail(clientPhone)
    if (tail.length < 6) return true
    return (await prisma.booking.count({ where: { clientPhone: { endsWith: tail } } })) === 0
  } catch {
    return false
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
