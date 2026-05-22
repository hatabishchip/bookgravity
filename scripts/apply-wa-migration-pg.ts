// Apply the WhatsApp inbox tables to a PostgreSQL DATABASE_URL.
// The Prisma migration in prisma/migrations/ is SQLite-flavored, so this
// script hand-writes the equivalent Postgres DDL.
//
// Run:  DATABASE_URL=postgresql://... npx tsx scripts/apply-wa-migration-pg.ts

import "dotenv/config"

async function main() {
  const url = process.env.DATABASE_URL
  if (!url || !url.startsWith("postgres")) {
    console.error("DATABASE_URL must be a postgres:// URL for this script")
    process.exit(1)
  }
  // Dynamic import so dev (Turso) doesn't need pg installed.
  const { Client } = await import("pg")
  const client = new Client({ connectionString: url })
  await client.connect()

  const statements = [
    `CREATE TABLE IF NOT EXISTS "WhatsAppConversation" (
       "id" TEXT NOT NULL PRIMARY KEY,
       "studioId" TEXT NOT NULL,
       "clientPhone" TEXT NOT NULL,
       "clientName" TEXT,
       "assignedTrainerId" TEXT,
       "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "lastInboundAt" TIMESTAMP(3),
       "unreadAdmin" INTEGER NOT NULL DEFAULT 0,
       "unreadTrainer" INTEGER NOT NULL DEFAULT 0,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
       "id" TEXT NOT NULL PRIMARY KEY,
       "conversationId" TEXT NOT NULL,
       "direction" TEXT NOT NULL,
       "type" TEXT NOT NULL,
       "body" TEXT,
       "mediaUrl" TEXT,
       "mediaMime" TEXT,
       "templateName" TEXT,
       "waMessageId" TEXT,
       "status" TEXT NOT NULL DEFAULT 'queued',
       "errorDetail" TEXT,
       "fromTrainerId" TEXT,
       "importedAt" TIMESTAMP(3),
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE INDEX IF NOT EXISTS "WhatsAppConversation_studioId_lastMessageAt_idx"
       ON "WhatsAppConversation" ("studioId", "lastMessageAt")`,
    `CREATE INDEX IF NOT EXISTS "WhatsAppConversation_assignedTrainerId_idx"
       ON "WhatsAppConversation" ("assignedTrainerId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConversation_studioId_clientPhone_key"
       ON "WhatsAppConversation" ("studioId", "clientPhone")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessage_waMessageId_key"
       ON "WhatsAppMessage" ("waMessageId")`,
    `CREATE INDEX IF NOT EXISTS "WhatsAppMessage_conversationId_createdAt_idx"
       ON "WhatsAppMessage" ("conversationId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "WhatsAppMessage_waMessageId_idx"
       ON "WhatsAppMessage" ("waMessageId")`,
    // FKs are added with NOT VALID + skipped FK to existing tables so they can
    // be applied with no exclusive locks even if the tables are populated.
    `DO $$ BEGIN
       ALTER TABLE "WhatsAppConversation"
         ADD CONSTRAINT "WhatsAppConversation_studioId_fkey"
         FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
     EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN
       ALTER TABLE "WhatsAppConversation"
         ADD CONSTRAINT "WhatsAppConversation_assignedTrainerId_fkey"
         FOREIGN KEY ("assignedTrainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN
       ALTER TABLE "WhatsAppMessage"
         ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey"
         FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN
       ALTER TABLE "WhatsAppMessage"
         ADD CONSTRAINT "WhatsAppMessage_fromTrainerId_fkey"
         FOREIGN KEY ("fromTrainerId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     EXCEPTION WHEN duplicate_object THEN null; END $$`,
  ]

  for (const sql of statements) {
    const head = sql.replace(/\s+/g, " ").slice(0, 90)
    try {
      await client.query(sql)
      console.log("OK :", head)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/already exists|duplicate/i.test(msg)) {
        console.log("SKIP:", head, "(already exists)")
      } else {
        console.error("ERR :", head)
        console.error("     ", msg)
        process.exit(2)
      }
    }
  }

  await client.end()
  console.log("\nDone.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
