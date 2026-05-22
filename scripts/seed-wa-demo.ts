// Demo seed for the WhatsApp inbox so you can preview /admin/inbox and
// /trainer/inbox before the real number is connected.
//
// Run:  DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/seed-wa-demo.ts
//
// Creates 5 conversations:
//   1. Anna  — assigned to first trainer, recent booking, last inbound 30 min ago
//      (24h window OPEN → can reply free-form)
//   2. Made — assigned to second trainer, last inbound 3 days ago
//      (24h window CLOSED → composer locked, only template allowed)
//   3. Putu — assigned to first trainer, never replied (only outbound template)
//   4. Stranger — no booking, assigned trainer = null (admin only)
//   5. Returning Wayan — full back-and-forth with several messages and statuses
//
// Idempotent: deletes existing conversations whose clientPhone starts with
// "62999" (the demo prefix) before re-seeding.

import "dotenv/config"
import { prisma } from "../lib/prisma"

const DEMO_PHONE_PREFIX = "62999"

type SeedMsg = {
  direction: "INBOUND" | "OUTBOUND"
  type: string
  body?: string
  templateName?: string
  status?: string
  agoMinutes: number
  fromTrainer?: boolean
}

async function main() {
  const studio = await prisma.studio.findFirst({
    where: { isDefault: true },
    include: { trainers: { take: 6, orderBy: { createdAt: "asc" } } },
  })
  if (!studio) {
    console.error("No default studio found — run prisma seed first.")
    process.exit(1)
  }
  if (studio.trainers.length < 2) {
    console.error("Need at least 2 trainers in the default studio.")
    process.exit(1)
  }
  const [t1, t2] = studio.trainers
  console.log(`Studio: ${studio.name}, trainers: ${t1.name}, ${t2.name}`)

  // Wipe existing demo data
  const existing = await prisma.whatsAppConversation.findMany({
    where: { studioId: studio.id, clientPhone: { startsWith: DEMO_PHONE_PREFIX } },
    select: { id: true },
  })
  if (existing.length) {
    await prisma.whatsAppMessage.deleteMany({
      where: { conversationId: { in: existing.map((c) => c.id) } },
    })
    await prisma.whatsAppConversation.deleteMany({
      where: { id: { in: existing.map((c) => c.id) } },
    })
    console.log(`Cleared ${existing.length} previous demo conversation(s).`)
  }

  type SeedConvo = {
    phone: string
    name: string
    assignedTrainerId: string | null
    lastInboundAgoMin: number | null
    messages: SeedMsg[]
  }

  const convos: SeedConvo[] = [
    {
      phone: `${DEMO_PHONE_PREFIX}00001`,
      name: "Anna (demo)",
      assignedTrainerId: t1.id,
      lastInboundAgoMin: 30,
      messages: [
        {
          direction: "OUTBOUND",
          type: "template",
          templateName: "booking_confirmed",
          body: "Hi Anna, your booking is confirmed.\nDate: Friday, 22 May\nTime: 09:00-11:00\nTicket: 421\n\nPlease show your ticket to the trainer at the studio. See you on the mat!",
          status: "delivered",
          agoMinutes: 120,
        },
        {
          direction: "INBOUND",
          type: "text",
          body: "Hi! Got it, thanks 🙏",
          agoMinutes: 90,
        },
        {
          direction: "INBOUND",
          type: "text",
          body: "Quick question — should I bring my own mat?",
          agoMinutes: 30,
        },
      ],
    },
    {
      phone: `${DEMO_PHONE_PREFIX}00002`,
      name: "Made (demo)",
      assignedTrainerId: t2.id,
      lastInboundAgoMin: 60 * 24 * 3, // 3 days ago — window closed
      messages: [
        {
          direction: "OUTBOUND",
          type: "template",
          templateName: "booking_confirmed",
          body: "Hi Made, your booking is confirmed.\nDate: Tuesday, 19 May\nTime: 17:00-19:00\nTicket: 158",
          status: "read",
          agoMinutes: 60 * 24 * 3 + 30,
        },
        {
          direction: "INBOUND",
          type: "text",
          body: "Thanks!",
          agoMinutes: 60 * 24 * 3,
        },
        {
          direction: "OUTBOUND",
          type: "text",
          body: "See you tomorrow 🌿",
          status: "read",
          agoMinutes: 60 * 24 * 3 - 5,
          fromTrainer: true,
        },
      ],
    },
    {
      phone: `${DEMO_PHONE_PREFIX}00003`,
      name: "Putu (demo)",
      assignedTrainerId: t1.id,
      lastInboundAgoMin: null,
      messages: [
        {
          direction: "OUTBOUND",
          type: "template",
          templateName: "booking_confirmed",
          body: "Hi Putu, your booking is confirmed.\nDate: Sunday, 24 May\nTime: 11:00-13:00\nTicket: 902",
          status: "sent",
          agoMinutes: 60 * 5,
        },
      ],
    },
    {
      phone: `${DEMO_PHONE_PREFIX}00004`,
      name: null as unknown as string, // anonymous stranger
      assignedTrainerId: null,
      lastInboundAgoMin: 10,
      messages: [
        {
          direction: "INBOUND",
          type: "text",
          body: "Halo, masih ada slot untuk besok pagi? Berapa harganya?",
          agoMinutes: 25,
        },
        {
          direction: "INBOUND",
          type: "text",
          body: "(translated: Hi, any slots tomorrow morning? How much?)",
          agoMinutes: 10,
        },
      ],
    },
    {
      phone: `${DEMO_PHONE_PREFIX}00005`,
      name: "Wayan (returning)",
      assignedTrainerId: t2.id,
      lastInboundAgoMin: 60 * 4,
      messages: [
        {
          direction: "INBOUND",
          type: "text",
          body: "Hi, can I move my Saturday class to Sunday same time?",
          agoMinutes: 60 * 6,
        },
        {
          direction: "OUTBOUND",
          type: "text",
          body: "Hey Wayan! Yes, just rebook on the site and I'll cancel the old one.",
          status: "read",
          agoMinutes: 60 * 5 + 30,
          fromTrainer: true,
        },
        {
          direction: "INBOUND",
          type: "text",
          body: "Done, ticket 705",
          agoMinutes: 60 * 5,
        },
        {
          direction: "OUTBOUND",
          type: "text",
          body: "Perfect 🌿 see you Sunday",
          status: "read",
          agoMinutes: 60 * 4 + 30,
          fromTrainer: true,
        },
        {
          direction: "INBOUND",
          type: "text",
          body: "🙏",
          agoMinutes: 60 * 4,
        },
      ],
    },
  ]

  const now = Date.now()

  for (const c of convos) {
    const lastInboundMsg = c.messages
      .filter((m) => m.direction === "INBOUND")
      .sort((a, b) => a.agoMinutes - b.agoMinutes)[0]
    const lastInboundAt =
      c.lastInboundAgoMin !== null
        ? new Date(now - c.lastInboundAgoMin * 60_000)
        : lastInboundMsg
          ? new Date(now - lastInboundMsg.agoMinutes * 60_000)
          : null
    const lastMessageAt = new Date(
      now -
        Math.min(...c.messages.map((m) => m.agoMinutes)) * 60_000,
    )

    const created = await prisma.whatsAppConversation.create({
      data: {
        studioId: studio.id,
        clientPhone: c.phone,
        clientName: c.name,
        assignedTrainerId: c.assignedTrainerId,
        lastInboundAt,
        lastMessageAt,
        unreadAdmin:
          c.messages.filter((m) => m.direction === "INBOUND" && m.agoMinutes <= 60).length,
        unreadTrainer:
          c.messages.filter((m) => m.direction === "INBOUND" && m.agoMinutes <= 60).length,
      },
    })

    for (const m of c.messages) {
      await prisma.whatsAppMessage.create({
        data: {
          conversationId: created.id,
          direction: m.direction,
          type: m.type,
          body: m.body ?? null,
          templateName: m.templateName ?? null,
          status: m.status ?? (m.direction === "INBOUND" ? "delivered" : "sent"),
          fromTrainerId:
            m.direction === "OUTBOUND" && m.fromTrainer ? c.assignedTrainerId : null,
          createdAt: new Date(now - m.agoMinutes * 60_000),
        },
      })
    }
    console.log(`Created: ${c.name ?? "(stranger)"} (${c.phone}) — ${c.messages.length} msgs`)
  }

  console.log("\nDone.")
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
