// One-off: hide every existing PRIVATE class in the Ubud studio from the public
// schedule (publicVisible = false). Going forward, new private classes default
// to hidden in the UI, but this back-fills the ones created before that change.
//
//   npx tsx scripts/hide-ubud-private.ts
//
// Idempotent — safe to re-run.

import { createClient } from "@libsql/client"
import "dotenv/config"

const url = process.env.DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

const client = createClient({ url, ...(authToken ? { authToken } : {}) })

async function run() {
  const studio = await client.execute({
    sql: `SELECT id, name FROM "Studio" WHERE slug = ?`,
    args: ["ubud"],
  })
  if (studio.rows.length === 0) {
    console.error("No studio with slug 'ubud' found.")
    process.exit(2)
  }
  const studioId = studio.rows[0].id as string
  console.log(`Ubud studio: ${studio.rows[0].name} (${studioId})`)

  const before = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM "TimeSlot" WHERE "studioId" = ? AND "classType" = 'PRIVATE' AND "publicVisible" = 1`,
    args: [studioId],
  })
  console.log(`PRIVATE slots currently visible: ${before.rows[0].n}`)

  const res = await client.execute({
    sql: `UPDATE "TimeSlot" SET "publicVisible" = 0 WHERE "studioId" = ? AND "classType" = 'PRIVATE'`,
    args: [studioId],
  })
  console.log(`Rows updated: ${res.rowsAffected}`)

  const after = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM "TimeSlot" WHERE "studioId" = ? AND "classType" = 'PRIVATE' AND "publicVisible" = 1`,
    args: [studioId],
  })
  console.log(`PRIVATE slots still visible (should be 0): ${after.rows[0].n}`)
  console.log("Done.")
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
