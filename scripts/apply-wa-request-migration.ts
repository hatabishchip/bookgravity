// One-shot: apply the WhatsApp activation request migration to Turso.
import { readFileSync } from "fs"
import { resolve } from "path"
import { createClient } from "@libsql/client"
import "dotenv/config"

async function run() {
  const sql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20260608000000_add_whatsapp_request/migration.sql"),
    "utf8",
  )
  const stmts = sql
    .split(/;\s*\n/)
    .map((s) =>
      s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim(),
    )
    .filter((s) => s.length > 0)

  const c = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  for (const stmt of stmts) {
    try {
      await c.execute(stmt)
      console.log("OK :", stmt.slice(0, 80))
    } catch (e) {
      const m = (e as Error).message
      if (m.includes("duplicate column")) {
        console.log("SKIP:", stmt.slice(0, 80))
      } else {
        console.error("ERR:", m)
        process.exit(2)
      }
    }
  }
  console.log("\nDone.")
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
