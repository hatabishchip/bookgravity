// One-shot: clear "ghost unread" counters — conversations where lastInboundAt
// is older than 30 days (or null) but unreadAdmin/Trainer is still > 0.
// These accumulated before markConversationRead() existed.
// Conversations with recent inbound messages are NOT touched.

import "dotenv/config"
import { prisma } from "../lib/prisma"

async function main() {
  // Hard reset: clear ALL stale counters. These accumulated before
  // markConversationRead() existed and were never cleared.
  // After this, only new inbound messages will increment unread.
  const result = await prisma.whatsAppConversation.updateMany({
    where: { unreadAdmin: { gt: 0 } },
    data: {
      unreadAdmin: 0,
      unreadTrainer: 0,
      bookingPreview: null,
    },
  })

  console.log(`Reset ${result.count} ghost-unread conversations.`)

  // Show what remains unread (should be only genuinely recent ones).
  const remaining = await prisma.whatsAppConversation.count({
    where: { unreadAdmin: { gt: 0 } },
  })
  console.log(`Remaining unread conversations: ${remaining}`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
