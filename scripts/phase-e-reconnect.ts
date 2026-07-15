// Phase E (docs/META_agent_autopilot.md, owner-approved 15.07.2026):
// one-shot reconnect of UNANSWERED closed-window chats.
//
// 1. Create a temporary "reconnect_missed_msg" template on the Canggu WABA
//    (exact owner-approved text, no variables).
// 2. Poll until Meta approves (utility templates usually approve in minutes).
// 3. Send it to the triaged list of clients whose real question was never
//    answered (courtesies / job seekers / gibberish / internal chats were
//    excluded by hand).
// 4. DELETE the template from Meta (owner: template list must stay clean).
// 5. Mirror every send into WhatsAppMessage so the inbox shows it.
//
// Writes progress to scratch log; exits non-zero if approval never came.
import { createClient } from "@libsql/client"
import "dotenv/config"

const GRAPH = "https://graph.facebook.com/v21.0"
const WABA_ID = "1571637721189360" // Canggu production WABA
const TEMPLATE_NAME = "reconnect_missed_msg"
const BODY_TEXT =
  "Hi! This is Gravity Stretching. Sorry we missed your message earlier - we are here now and happy to help. Just reply and we will answer right away 🙏"

// Triaged recipients (Canggu, closed window, message genuinely unanswered).
const RECIPIENTS: { phone: string; convoId?: string; name: string }[] = [
  { phone: "6281246571809", name: "Ruben" },
  { phone: "6282353406968", name: "Eleanor Raja Ampat" },
  { phone: "6281340834472", name: "Ivonne Helena" },
  { phone: "6287860582631", name: "Manik delima" },
  { phone: "6281217733649", name: "(ad lead)" },
  { phone: "6285238126703", name: "Mumun" },
  { phone: "6283114309566", name: "nengahnuaja967" },
  { phone: "628113991303", name: "Nelvi" },
  { phone: "6285138713348", name: "tuyo15668" },
  { phone: "6282395190831", name: "ido mahing" },
  { phone: "62817345877", name: "Rita Hartono" },
  { phone: "6289611905094", name: "meylinausodoningsih05" },
  { phone: "6281246230626", name: "alexdanur75" },
  { phone: "13142011725", name: "Abra McField" },
  { phone: "447974282268", name: "S" },
  { phone: "628134568708", name: "Tomas" },
  { phone: "6282232052999", name: "Fang Fang" },
  { phone: "628123836243", name: "Yani" },
  { phone: "6281380090069", name: "Ella Furber" },
  { phone: "79995641626", name: "Liza" },
  { phone: "6281935188385", name: "(cancel help)" },
  { phone: "32475727292", name: "Saadia" },
  { phone: "79160354498", name: "Tatiana Stepanchenko" },
  { phone: "6282386028545", name: "Keydi_beautytouch" },
  { phone: "6282110171799", name: "Seni Sun" },
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  const studio = await db.execute(
    `SELECT id, whatsappPhoneNumberId, whatsappAccessToken FROM Studio WHERE slug='canggu'`,
  )
  const row = studio.rows[0] as unknown as { id: string; whatsappPhoneNumberId: string | null; whatsappAccessToken: string | null }
  const token = row.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = row.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) {
    console.error("no canggu WA token / phone id")
    process.exit(1)
  }

  // ---- 1. create template ------------------------------------------------
  const create = await fetch(`${GRAPH}/${WABA_ID}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: TEMPLATE_NAME,
      language: "en",
      category: "UTILITY",
      components: [{ type: "BODY", text: BODY_TEXT }],
    }),
  })
  const created = (await create.json()) as { id?: string; status?: string; error?: { message: string; error_user_msg?: string } }
  if (!create.ok && !/already exists/i.test(created.error?.message ?? "")) {
    console.error("template create failed:", JSON.stringify(created))
    process.exit(2)
  }
  console.log("template submitted:", created.id ?? "(existed)", created.status ?? "")

  // ---- 2. wait for approval (max ~12 min) --------------------------------
  let approved = created.status === "APPROVED"
  for (let i = 0; i < 24 && !approved; i++) {
    await sleep(30_000)
    const q = await fetch(`${GRAPH}/${WABA_ID}/message_templates?name=${TEMPLATE_NAME}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const j = (await q.json()) as { data?: { name: string; status: string }[] }
    const st = j.data?.find((t) => t.name === TEMPLATE_NAME)?.status
    console.log("poll", i, "status:", st)
    if (st === "APPROVED") approved = true
    if (st === "REJECTED") {
      console.error("template REJECTED")
      process.exit(3)
    }
  }
  if (!approved) {
    console.error("not approved within 12 min - rerun later, template stays pending")
    process.exit(4)
  }

  // ---- 3. send to everyone ------------------------------------------------
  let sent = 0
  let failed = 0
  for (const r of RECIPIENTS) {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: r.phone,
        type: "template",
        template: { name: TEMPLATE_NAME, language: { code: "en" } },
      }),
    })
    const j = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } }
    const waId = j.messages?.[0]?.id ?? null
    if (res.ok && waId) sent++
    else {
      failed++
      console.error("send failed", r.phone, j.error?.message)
    }
    // Mirror into the inbox thread.
    const convo = await db.execute({
      sql: `SELECT id FROM WhatsAppConversation WHERE clientPhone=? AND studioId=?`,
      args: [r.phone, row.id],
    })
    const convoId = convo.rows[0]?.id as string | undefined
    if (convoId) {
      const now = new Date().toISOString()
      await db.execute({
        sql: `INSERT INTO WhatsAppMessage (id, conversationId, direction, type, body, templateName, waMessageId, status, createdAt, fromAgent)
              VALUES (?, ?, 'OUTBOUND', 'template', ?, ?, ?, ?, ?, true)`,
        args: [
          "rcn_" + Math.random().toString(36).slice(2, 14),
          convoId,
          BODY_TEXT,
          TEMPLATE_NAME,
          waId,
          waId ? "sent" : "failed",
          now,
        ],
      })
      await db.execute({ sql: `UPDATE WhatsAppConversation SET lastMessageAt=?, updatedAt=? WHERE id=?`, args: [now, now, convoId] })
    }
    console.log(waId ? "sent ->" : "FAILED ->", r.name, r.phone)
    await sleep(700)
  }

  // ---- 4. delete the template ----------------------------------------------
  const del = await fetch(`${GRAPH}/${WABA_ID}/message_templates?name=${TEMPLATE_NAME}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  const dj = (await del.json()) as { success?: boolean; error?: { message: string } }
  console.log("template deleted:", dj.success === true ? "yes" : JSON.stringify(dj))

  console.log(`DONE sent=${sent} failed=${failed} of ${RECIPIENTS.length}`)
})()
