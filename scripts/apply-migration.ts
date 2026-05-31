// Generic one-shot migration applier for Turso, same approach as the
// per-migration apply-*.ts scripts but parametrized:
//
//   npx tsx scripts/apply-migration.ts <migration_folder_name>
//
// Reads prisma/migrations/<name>/migration.sql, runs each statement against
// DATABASE_URL, tolerating "already exists" / "duplicate column" on re-runs.

import { readFileSync } from "fs"
import { resolve } from "path"
import { createClient } from "@libsql/client"
import "dotenv/config"

const migrationName = process.argv[2]
if (!migrationName) {
  console.error("Usage: tsx scripts/apply-migration.ts <migration_folder_name>")
  process.exit(1)
}

const url = process.env.DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

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
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        console.log("SKIP:", head, "(already exists)")
      } else {
        console.error("ERR :", head)
        console.error("     ", msg)
        process.exit(2)
      }
    }
  }
  console.log("\nDone:", migrationName)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
