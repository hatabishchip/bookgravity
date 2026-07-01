// One-shot: create the BankPayment table on Turso. Idempotent - safe to re-run
// (existing table/index is tolerated). Mirrors the other apply-*-migration.ts
// scripts. Run from the project dir:  npx tsx scripts/apply-bank-payment-migration.ts
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

const migrationName = "20260702000000_add_bank_payment"

const sql = readFileSync(
  resolve(process.cwd(), `prisma/migrations/${migrationName}/migration.sql`),
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
      if (/already exists|duplicate column/i.test(msg)) {
        console.log("SKIP (exists):", head)
      } else {
        console.error("FAIL:", head, "\n ", msg)
        process.exit(1)
      }
    }
  }
  console.log("Done.")
}
run()
