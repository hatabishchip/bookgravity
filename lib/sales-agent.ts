// AI sales agent for the WhatsApp + Instagram + Facebook inbox.
//
// FULL AUTONOMY since 23.07.2026 (metaprompt docs/META_agent_full_autonomy.md):
// the agent answers EVERY inbound itself - method questions, prices, live
// schedule availability, medical situations (Andrey-voice playbook, no
// diagnoses), complaints, partnerships, job inquiries. It never CREATES
// bookings - it guides clients to self-service at bookgravity.com. Trainers
// get no pings from the agent. Messenger-style replies (short, greet once,
// prices as 300k). Legacy suggest-mode prompt remains below for the
// AGENT_FULL_AUTONOMY-off fallback.
//
// Model: Claude Sonnet 5 ONLY (owner 23.07) - no fallback models; failures
// are logged to EventLog and the sweep retries. Every status change on
// a suggestion is a future training signal (see agent/sales-agent-knowledge.md).
import { prisma } from "@/lib/prisma"

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_MODEL = "claude-sonnet-5"

// Living knowledge base (mirrored for humans in agent/sales-agent-knowledge.md).
// Owner-taught lessons get appended here by the learning loop.
const KNOWLEDGE = `
STUDIO FACTS (verified):
- Gravity Stretching Canggu, Bali. Group class 75-90 minutes, small groups up to 6 people, IDR 300,000.
- Location (send as link): https://maps.app.goo.gl/2c15nQsdKzEBREey9
- Schedule & booking: https://bookgravity.com
- Instagram: @gravitystretchcanggu (exact handle - one word, no dots). TikTok: @gravitystretchingcanggu. NEVER invent or guess a handle/phone/email/link that is not written here - offer to pass the request to the team instead.
- Trainer guides the whole class and the lianas hold your full weight, so the body can fully let go.
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
- Answer structure for the FIRST reply to an ad lead (owner 23.07 - the old lecture opener lost 82% of leads): greeting + ONE line connecting their pain to relief + the nearest one or two concrete open slots from the LIVE SCHEDULE + which time suits them + booking link. Under 45 words. Method explanation, price and location come LATER, when they reply and ask.
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
- Being fully held: the lianas carry your whole weight and the trainer is next to you the whole class, which is exactly why the body finally lets go and relaxes. RESERVED FOR REASSURANCE: the "nowhere to fall" phrasing answers a fear the client has already voiced - never open with it (see the fear rule in ANSWER RULES).
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
- IMPORTANT (ad leads): our ads are ABOUT conditions like "saraf kejepit" (pinched nerve) / back pain, so most leads open with "I saw your ad about pinched nerve, tell me more". This is a GENERAL interest question, NOT a personal medical disclosure - answer it as SAFE using the first-reply-to-ad-lead formula (one relief line + concrete slots + closing question), and give NO medical advice, diagnosis or cure promise. Only escalate when the person asks about THEIR OWN specific condition/surgery and whether it is safe for them.

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
- Answer EVERYTHING yourself, in ONE message. NEVER say "I'll ask the team", "a coach will contact you", "someone will follow up personally" - nobody else replies in this chat, and empty promises break trust.
- THIS IS A MESSENGER, NOT EMAIL (owner 23.07). Answer ONLY what was asked - do not dump every fact you know. A normal reply is 1-3 short sentences, under 40 words plus the greeting. Health situations and "how does a first class go" may take up to 80-100 words. Never repeat facts already given earlier in this conversation. Do not add adjacent facts the client did not ask about (payment methods, equipment, what to bring, class length) - one extra detail maximum when it truly helps.
- Your FIRST reply of a conversation opens with a warm time-of-day greeting - "Good morning!" / "Good afternoon!" / "Good evening!" (Bali local time is given in the message) - then the answer. Mid-conversation replies skip greetings entirely and start straight with the answer - no "Hi X!", no "Thanks for reaching out" again.
- Warm and inviting, never curt (owner 23.07): the facts stay short, but the delivery is kind - a soft welcoming touch is always appropriate ("we'd love to see you").
- No fixed template - vary how replies start and end. End with a question ONLY when it is natural; most short answers need none.
- Prices short and human: 300k, 250k, 1.3M IDR - never "300,000 IDR".
- Links: at most ONE per message, and only when it directly serves the need. Introduce the booking link as an invitation - "the schedule and booking are here: https://bookgravity.com" - never a bare URL dropped at the end. Never send both links together; never attach a link "just in case". If the booking link was ALREADY sent earlier in this conversation, do not paste it again in every reply (a real client got it 5 times in a row, 23.07) - they have it; resend only when they ask for it or when the last one is far up the thread.
- Explain the method through an image (gravity presses down - hanging stretches you; the disc is a sponge) at most ONCE per conversation, usually in the first pitch. Do not re-pitch the method in every reply.
- NEVER RAISE FEAR THE CLIENT HAS NOT RAISED (owner 24.07). Reassurance about falling, danger or being scared - "nowhere to fall", "nothing to grip in fear", "it is completely safe", "do not be afraid" - plants the very worry it answers when nobody asked. Say it ONLY after the client themselves brings up fear or safety ("is it scary?", "is it safe?", "I am afraid of heights", "what if I fall?"). Then answer it warmly and plainly: the lianas carry your whole weight and the trainer is beside you the entire class. Unasked, describe the practice by what it gives - space, lightness, the body letting go - never by the danger it avoids.
- The same principle covers EVERY negative the client has not raised (owner 24.07): do not volunteer injuries, contraindications, cancellation ("you can cancel anytime" invites cancelling - explain cancellation only when they ask about it), age or fitness doubts, or pain beyond what the client themselves described. Answer what was raised; never seed a worry.
- Word choice: a slot is "open" or "available" - NEVER "free" (a client read "9:00 free" as a free-of-charge class, 23.07). Name only the class START time ("at 9:00"), never a range like "9:00-11:00".
- Light emojis (0-2). ALWAYS write the draft in English (studio staff language shown to the trainer for review), regardless of the client's language or the thread history. The client automatically receives the reply translated into their own language (English/Russian/Bahasa/etc.) on send.
- A client message shown as "[attachment]" is a photo/story reply/voice note we cannot see. Never guess its content. If it opens the conversation, greet them warmly and ask what they're looking for. If it arrives mid-conversation, only reply when context makes the intent obvious - otherwise use an empty draft "".
- FIRST REPLY TO AN AD LEAD (marked in the message): NO method lecture. Formula: greeting + ONE short line connecting their pain to relief + the nearest ONE or TWO concrete open slots from the LIVE SCHEDULE ("Tomorrow we have 9:00 or 11:00 open") + a closing question which time suits them + the booking link. Under 45 words total. The method explanation waits until they reply. VARY the relief line - do not repeat one stock phrase to every lead (live replies 24.07: six leads in a row got the identical sentence). Rotate angles like: "hanging gently takes the pressure off the spine", "in the lianas the back finally gets to lengthen and rest", "a gentle hang gives the discs room again - most feel lighter after one class".

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
- Core message in your words: we always start from absolute zero; we never work through pain; for every situation we find a soft, suitable way to work with the body. At the studio the trainer asks about your body first and adapts every stretch personally. 5 of the 7 practice levels are accessible to anyone. Mention that the lianas carry the full weight only if they ask whether it is scary or unsafe.
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
  // Sonnet 5 ONLY (owner 23.07: "оставь только сонет, остальные отключай").
  // The old Gemini -> Groq -> Cerebras fallback chain is removed: reply
  // quality must never silently degrade to a weaker model. Resilience comes
  // from an in-call retry (transients hit 2/16 in the QA run) plus the sweep
  // itself retrying the inbound on its next pass. A hard Anthropic outage is
  // logged loudly instead of masked.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[sales-agent] ANTHROPIC_API_KEY missing - agent cannot answer")
    return null
  }
  let lastErr = ""
  for (let attempt = 1; attempt <= 2; attempt++) {
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
          // 700 was too tight: a reasoning block could eat the budget and
          // leave no text at all ("empty content" storm, 22.07 18:00).
          max_tokens: 2000,
          // Prompt caching (owner 24.07): the ~5k-token system prompt was 75%
          // of API cost - repeat calls within the hour now read it at ~10% of
          // the input price. Byte-identical prefix reuse only; quality and the
          // prompt the model sees are unchanged. The short LESSON_SYSTEM is
          // below the cacheable minimum and silently skips caching - fine.
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral", ttl: "1h" } }],
          messages: [{ role: "user", content: userPrompt }],
        }),
      })
      if (r.ok) {
        const j = (await r.json()) as {
          content?: { type?: string; text?: string }[]
          stop_reason?: string
        }
        // Take the first TEXT block - content[0] is not guaranteed to be the
        // answer (a reasoning block can come first).
        const t = j.content?.find((c) => c.type === "text" && c.text?.trim())?.text
          ?? j.content?.map((c) => c.text ?? "").join("").trim()
        if (t) return t
        lastErr = `empty content (stop_reason=${j.stop_reason ?? "?"}, blocks=${j.content?.map((c) => c.type).join(",") ?? "none"})`
      } else {
        lastErr = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`
        // 4xx (bad key / out of credit) won't heal on retry - fail fast & loud.
        if (r.status >= 400 && r.status < 500 && r.status !== 429) break
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
    if (attempt === 1) await new Promise((res) => setTimeout(res, 1500))
  }
  // Loud trail: the agent has NO fallback model - staff must see why it went
  // quiet (e.g. Anthropic credit ran out) instead of a silent client queue.
  try {
    const { elogError } = await import("@/lib/elog")
    void elogError("sales-agent", "anthropic call failed (no fallback by owner rule)", { error: lastErr })
  } catch {}
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

// Bali wall-clock for the time-of-day greeting rule (owner 23.07).
function baliTimeLine(): string {
  const d = new Date(Date.now() + 8 * 3600_000)
  const hh = d.getUTCHours()
  const part = hh >= 5 && hh < 11 ? "morning" : hh >= 11 && hh < 17 ? "afternoon" : hh >= 17 && hh < 23 ? "evening" : "late night - still greet with Good evening"
  return `Bali local time: ${String(hh).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} (${part})`
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
    // Weekday spelled out per line - the model guessed it from the date and
    // told a client "tomorrow (Thursday)" when tomorrow was Friday (23.07).
    const dayName = (d: string) =>
      // Parse as UTC midnight of the DATE ITSELF: parsing Bali midnight and
      // reading getUTCDay() yields the previous day (caught in QA 23.07 -
      // "today is Wednesday" on a Thursday).
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${d}T00:00:00Z`).getUTCDay()]
    const lines = slots.map((s) => {
      const left = Math.max(0, s.maxCapacity - s._count.bookings)
      const who = s.trainer?.name ? ` with ${s.trainer.name}` : ""
      // START time only: the stored range is the 2h staff slot (class is
      // 75-90 min), and quoting "15:00-17:00" made clients read it as a
      // two-hour class or one long window (live replies, 24.07). "open", not
      // "free": Julien (23.07) read "9:00 free" as a FREE class and the agent
      // had to walk it back twice.
      return `${s.date} (${dayName(s.date)}) ${s.startTime}${who}: ${left === 0 ? "FULL" : `${left} spot${left === 1 ? "" : "s"} open`}`
    })
    return `\n\nLIVE SCHEDULE (next 7 days, Bali time, real-time data; today is ${today} (${dayName(today)})). Answer availability questions with these facts. A class not listed here does not exist. Times are class START times - tell clients the start time only, never a range. Say a slot is "open" or "available"; NEVER call a slot "free" (clients read "free" as no charge). Booking stays self-service at https://bookgravity.com:\n${lines.join("\n")}`
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
  adLead = false,
): Promise<Classification | null> {
  const adLeadLine = adLead ? `\nLead type: FIRST REPLY TO AN AD LEAD (came from the ad "pain ad")` : ""
  const userPrompt = `Client name: QA Test\nClient status: ${clientStatus}${adLeadLine}\n${baliTimeLine()}${await liveScheduleBlock()}\n\nConversation (oldest first):\nCLIENT: ${message}\n\nClassify the LAST client message and draft the reply per the rules.`
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

// `null` means the answer did NOT happen (LLM failed, bad JSON, crash) - the
// autopilot keeps counting that inbound as unanswered so a stuck chat stays
// visible. `noReplyNeeded` means the opposite: the agent looked and decided
// nothing is owed ("ok thanks" / spam), or the twin sweep already replied.
// Without this split, deliberate silence surfaced in the sweep summary as
// unanswered:1 and read like a stuck client (owner asked about it twice).
export type SuggestionResult =
  | { id: string; category: string; draft: string | null; noReplyNeeded?: false }
  | { id: null; category: string; draft: null; noReplyNeeded: true }
  | null

const NO_REPLY_NEEDED = { id: null, category: "SAFE", draft: null, noReplyNeeded: true } as const

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
      select: { id: true, clientName: true, clientPhone: true, lastInboundAt: true, adReferralAt: true, adHeadline: true, studio: { select: { slug: true } } },
    })
    if (!convo) return null
    // Owner 15.07: the sales agent runs ONLY for the Canggu studio.
    if (convo.studio?.slug !== "canggu") return null

    // Skip if we already suggested for this inbound.
    const existing = await prisma.agentSuggestion.findFirst({
      where: { conversationId, inboundMessageId },
      select: { id: true, category: true, draft: true, status: true },
    })
    // Full autonomy: a legacy pending card with NO draft (old ESCALATE "wait
    // for the trainer") would block this inbound forever - the autopilot skips
    // draft-less suggestions. Regenerate a full answer into the SAME row.
    let regenerateId: string | null = null
    if (existing) {
      if (FULL_AUTONOMY && existing.status === "pending" && !existing.draft?.trim()) {
        regenerateId = existing.id
      } else if (existing.status === "pending") {
        return { id: existing.id, category: existing.category, draft: existing.draft }
      } else {
        return null
      }
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

    // First touch of an ad lead: the client came from a pain ad and the agent
    // has not spoken yet. 82% of ad leads went silent after the old
    // lecture-style opener (owner 23.07) - this flag switches the prompt to
    // the "one line of relief + two concrete slots + closing question" rule.
    const isAdLead = !!convo.adReferralAt
    const agentSpokeBefore = history.some((m) => m.direction === "OUTBOUND")
    const adLeadLine = isAdLead && !agentSpokeBefore ? `\nLead type: FIRST REPLY TO AN AD LEAD (came from the ad "${convo.adHeadline ?? "pain ad"}")` : ""

    const userPrompt = `Client name: ${convo.clientName ?? "unknown"}\nClient status: ${clientStatus}${adLeadLine}\n${baliTimeLine()}${scheduleBlock}\n\nConversation (oldest first):\n${transcript}\n\nClassify the LAST client message and draft the reply per the rules.`

    const raw = await callLlm(await buildSystemPrompt(), userPrompt)
    if (process.env.AGENT_DEBUG) console.log("[sales-agent] raw:", raw)
    if (!raw) return null
    const parsed = parseClassification(raw)
    if (process.env.AGENT_DEBUG) console.log("[sales-agent] parsed:", JSON.stringify(parsed))
    if (!parsed) return null

    // Empty SAFE draft = nothing worth replying; don't create noise.
    if (parsed.category === "SAFE" && !(parsed.draft && parsed.draft.trim())) return NO_REPLY_NEEDED

    const data = {
      category: parsed.category,
      draft: parsed.category === "ESCALATE" ? null : parsed.draft?.trim() || null,
      reason: parsed.category === "SAFE" ? null : (parsed.reason?.trim() || "Needs a human reply"),
    }
    // Both schedulers (Vercel cron + Hermes cron) fire the sweep seconds apart,
    // so two runs can pass the "already suggested?" check above at the same
    // time and each create a card for the SAME inbound - the client then gets
    // the identical reply twice (3 clients hit this on 23.07). A unique index
    // on (conversationId, inboundMessageId) makes the loser's insert fail;
    // it takes over the winner's card instead of sending a second answer.
    let saved
    if (regenerateId) {
      saved = await prisma.agentSuggestion.update({ where: { id: regenerateId }, data })
    } else {
      try {
        saved = await prisma.agentSuggestion.create({ data: { conversationId, inboundMessageId, ...data } })
      } catch {
        const winner = await prisma.agentSuggestion.findFirst({
          where: { conversationId, inboundMessageId },
          select: { id: true, category: true, draft: true, status: true },
        })
        if (!winner) throw new Error("suggestion insert lost the race but no row found")
        // Only the pending card is still ours to send; anything already sent
        // means the other sweep delivered the answer - stay silent.
        return winner.status === "pending"
          ? { id: winner.id, category: winner.category, draft: winner.draft }
          : NO_REPLY_NEEDED
      }
    }
    return { id: saved.id, category: saved.category, draft: saved.draft }
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
