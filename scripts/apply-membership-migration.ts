// One-shot script to apply the memberships (абонементы) migration directly to
// Turso, matching the pattern used by the other apply-*-migration.ts scripts.
//
// Reads prisma/migrations/20260601000000_add_membership/migration.sql and runs
// each statement against DATABASE_URL, then records it in _prisma_migrations.

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

const migrationName = "20260601000000_add_membership"

const sql = readFileSync(
  resolve(process.cwd(), `prisma/migrations/${migrationName}/migration.sql`),
  "utf8"
)

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
      // Tolerate re-runs: table/index/column already there.
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        console.log("SKIP:", head, "(already exists)")
      } else {
        console.error("ERR :", head)
        console.error("     ", msg)
        process.exit(2)
      }
    }
  }

  try {
    await client.execute({
      sql: `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
            VALUES (lower(hex(randomblob(16))), ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, 1)`,
      args: ["manual-apply-membership", migrationName],
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
