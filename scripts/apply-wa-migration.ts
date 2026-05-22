// One-shot script to apply the WhatsApp inbox migration directly to Turso/Postgres,
// because the local dev.db is out of sync with the actual dev DB and `prisma migrate dev`
// would try to also "fix" earlier multi-studio columns it thinks are missing.
//
// Reads the SQL from prisma/migrations/20260522105825_add_whatsapp_inbox/migration.sql
// and executes each statement against DATABASE_URL.

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
  resolve(process.cwd(), "prisma/migrations/20260522105825_add_whatsapp_inbox/migration.sql"),
  "utf8"
)

// Split on `;` followed by newline. Strip leading -- comment lines from each
// chunk before checking emptiness, otherwise blocks like "-- CreateTable\nCREATE TABLE..."
// get rejected.
const stmts = sql
  .split(/;\s*\n/)
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim()
  )
  .filter((s) => s.length > 0)

const client = createClient({ url, ...(authToken ? { authToken } : {}) })

async function run() {
  for (const stmt of stmts) {
    const head = stmt.replace(/\s+/g, " ").slice(0, 80)
    try {
      await client.execute(stmt)
      console.log("OK :", head)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Tolerate "table already exists" / "index already exists" if rerun
      if (msg.includes("already exists")) {
        console.log("SKIP:", head, "(already exists)")
      } else {
        console.error("ERR :", head)
        console.error("     ", msg)
        process.exit(2)
      }
    }
  }

  // Mark the migration as applied in _prisma_migrations so Prisma doesn't
  // try to re-run it later.
  const migrationName = "20260522105825_add_whatsapp_inbox"
  try {
    await client.execute({
      sql: `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
            VALUES (lower(hex(randomblob(16))), ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, 1)`,
      args: ["manual-apply-wa-inbox", migrationName],
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

  console.log("\nDone.")
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
