// One-shot: apply the WhatsAppConversationAccess migration to Turso.
//
// Reads SQL from prisma/migrations/20260526000000_add_conversation_access/
// and executes statements against DATABASE_URL.

import { readFileSync } from "fs"
import { resolve } from "path"
import { createClient } from "@libsql/client"
import "dotenv/config"

const url = process.env.DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

const sql = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260526000000_add_conversation_access/migration.sql",
  ),
  "utf8",
)

const stmts = sql
  .split(/;\s*\n/)
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter((s) => s.length > 0)

const client = createClient({ url, ...(authToken ? { authToken } : {}) })

async function run() {
  for (const stmt of stmts) {
    const head = stmt.replace(/\s+/g, " ").slice(0, 90)
    try {
      await client.execute(stmt)
      console.log("OK :", head)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("already exists")) {
        console.log("SKIP:", head, "(already exists)")
      } else {
        console.error("ERR :", head)
        console.error("     ", msg)
        process.exit(2)
      }
    }
  }

  const migrationName = "20260526000000_add_conversation_access"
  try {
    await client.execute({
      sql: `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
            VALUES (lower(hex(randomblob(16))), ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, 1)`,
      args: ["manual-apply-conversation-access", migrationName],
    })
    console.log("OK : marked migration applied in _prisma_migrations")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("UNIQUE") || msg.includes("already")) {
      console.log("SKIP: migration row already present")
    } else {
      console.warn("WARN: could not mark migration applied:", msg)
    }
  }

  // Quick post-migration audit: how many access rows did we end up with,
  // and how many conversations still have zero trainers?
  const totalRes = await client.execute(
    `SELECT COUNT(*) AS n FROM "WhatsAppConversationAccess"`,
  )
  const orphanRes = await client.execute(
    `SELECT COUNT(*) AS n FROM "WhatsAppConversation" c
     WHERE NOT EXISTS (
       SELECT 1 FROM "WhatsAppConversationAccess" a WHERE a."conversationId" = c."id"
     )`,
  )
  console.log(`\nAccess rows total : ${totalRes.rows[0].n}`)
  console.log(`Convos w/o access : ${orphanRes.rows[0].n}`)

  console.log("\nDone.")
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
