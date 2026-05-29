// One-shot: set inboxLanguage='ru' for Canggu and Ubud so all WA messages
// in those studios get translated to Russian for the admin inbox.
import { createClient } from "@libsql/client"
import "dotenv/config"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}
const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })

async function run() {
  const before = await c.execute(`SELECT slug, inboxLanguage FROM "Studio"`)
  console.log("Before:")
  for (const row of before.rows) {
    console.log(" ", row.slug, "→", row.inboxLanguage ?? "(off)")
  }
  await c.execute(
    `UPDATE "Studio" SET inboxLanguage='ru' WHERE slug IN ('canggu','ubud')`,
  )
  const after = await c.execute(`SELECT slug, inboxLanguage FROM "Studio"`)
  console.log("\nAfter:")
  for (const row of after.rows) {
    console.log(" ", row.slug, "→", row.inboxLanguage ?? "(off)")
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
