// One-shot, idempotent: add performance indexes to Turso.
//   node_modules/.bin/tsx scripts/apply-indexes-migration.ts
//
// Index names match Prisma's default naming (Table_col[_col]_idx) so the schema
// and the live DB stay conceptually in sync. CREATE INDEX IF NOT EXISTS makes
// every statement safe to re-run.
import { createClient } from "@libsql/client"
import "dotenv/config"

const url = process.env.DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url) {
  console.error("DATABASE_URL not set")
  process.exit(1)
}

const stmts = [
  // Hottest query: calendar "this studio, this date range".
  `CREATE INDEX IF NOT EXISTS "TimeSlot_studioId_date_idx" ON "TimeSlot" ("studioId", "date")`,
  // Trainer schedule filters by trainer.
  `CREATE INDEX IF NOT EXISTS "TimeSlot_trainerId_idx" ON "TimeSlot" ("trainerId")`,
  // Counting confirmed attendees on a slot (capacity, client lists).
  `CREATE INDEX IF NOT EXISTS "Booking_slotId_status_idx" ON "Booking" ("slotId", "status")`,
  // Client lookups by phone (membership balance, OTP autofill, cancel bot).
  `CREATE INDEX IF NOT EXISTS "Booking_clientPhone_idx" ON "Booking" ("clientPhone")`,
  // Restoring a class when a membership-paid booking is cancelled.
  `CREATE INDEX IF NOT EXISTS "Booking_membershipId_idx" ON "Booking" ("membershipId")`,
]

const client = createClient({ url, ...(authToken ? { authToken } : {}) })

async function run() {
  for (const stmt of stmts) {
    const head = stmt.replace(/\s+/g, " ").slice(0, 90)
    try {
      await client.execute(stmt)
      console.log("OK :", head)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("FAIL:", head, "\n ", msg)
      process.exit(1)
    }
  }
  console.log("Done.")
}
run()
