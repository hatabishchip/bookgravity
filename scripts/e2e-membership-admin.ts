// E2E: Sveta's member-card admin functions on PROD via real APIs (Ubud admin
// cookie). Test client phone only; cleans up after itself.
//   npx tsx scripts/e2e-membership-admin.ts run      - full pass
//   npx tsx scripts/e2e-membership-admin.ts cleanup  - remove leftovers
import { createClient } from "@libsql/client"
import { encode } from "next-auth/jwt"
import "dotenv/config"

const BASE = "https://bookgravity.com"
const TEST_PHONE = "6289900112233" // fake test number, digits only

const db = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })

async function ubudAdminCookie() {
  const u = await db.execute(`SELECT u.id, u.email, u.studioId FROM User u JOIN Studio s ON s.id = u.studioId WHERE u.role='ADMIN' AND s.slug='ubud' LIMIT 1`)
  const row = u.rows[0] as { id: string; email: string; studioId: string }
  const token = await encode({
    token: { sub: row.id, id: row.id, email: row.email, role: "ADMIN", studioId: row.studioId },
    secret: process.env.AUTH_SECRET!,
    salt: "__Secure-authjs.session-token",
  })
  return `__Secure-authjs.session-token=${token}`
}

async function cleanup() {
  const r = await db.execute({ sql: `DELETE FROM Membership WHERE clientPhone = ?`, args: [TEST_PHONE] })
  console.log(`cleanup: removed ${r.rowsAffected} test memberships`)
}

async function run() {
  const cookie = await ubudAdminCookie()
  const H = { "Content-Type": "application/json", cookie }

  // 1) sell a FREE card (admin) - classPrice must be 0
  let res = await fetch(`${BASE}/api/memberships`, {
    method: "POST", headers: H,
    body: JSON.stringify({ clientPhone: TEST_PHONE, clientName: "E2E Card Probe", paymentType: "FREE", totalClasses: 6 }),
  })
  const sold = await res.json()
  const cardId = sold.membership?.id
  console.log(`1. sell FREE -> ${res.status} classPrice=${sold.membership?.classPrice} remaining=${sold.remaining} ${res.ok && sold.membership?.classPrice === 0 ? "OK" : "FAIL"}`)

  // 2) FREE never in cashflow: current month income must not contain this card
  const now = new Date()
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  res = await fetch(`${BASE}/api/admin/cashflow?month=${ym}`, { headers: { cookie } })
  const cf = await res.json().catch(() => null)
  const inCf = JSON.stringify(cf ?? {}).includes(cardId ?? "@@none@@")
  console.log(`2. cashflow excludes FREE -> ${res.status} present=${inCf} ${res.ok && !inCf ? "OK" : "FAIL"}`)

  // 3) deduct 2 already-used classes -> remaining 4
  res = await fetch(`${BASE}/api/memberships`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ action: "deduct", clientPhone: TEST_PHONE, classes: 2 }),
  })
  const ded = await res.json()
  console.log(`3. deduct 2 -> ${res.status} remaining=${ded.remaining} ${res.ok && ded.remaining === 4 ? "OK" : "FAIL"}`)

  // 4) over-deduct must 409
  res = await fetch(`${BASE}/api/memberships`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ action: "deduct", clientPhone: TEST_PHONE, classes: 20 }),
  })
  console.log(`4. over-deduct -> ${res.status} ${res.status === 409 ? "OK" : "FAIL"}`)

  // 5) name autofill from data: GET ?phone returns the stored name
  res = await fetch(`${BASE}/api/memberships?phone=${TEST_PHONE}`, { headers: { cookie } })
  const info = await res.json()
  console.log(`5. name lookup -> ${res.status} name=${info.name} isAdmin=${info.isAdmin} ${info.name === "E2E Card Probe" && info.isAdmin === true ? "OK" : "FAIL"}`)

  // 6) cancel the sale -> card gone, balance 0
  res = await fetch(`${BASE}/api/memberships?id=${encodeURIComponent(cardId)}`, { method: "DELETE", headers: { cookie } })
  const after = await fetch(`${BASE}/api/memberships?phone=${TEST_PHONE}`, { headers: { cookie } }).then((r) => r.json())
  console.log(`6. cancel sale -> ${res.status} remaining=${after.remaining} ${res.ok && after.remaining === 0 ? "OK" : "FAIL"}`)

  await cleanup()
}

;(async () => {
  const mode = process.argv[2] ?? "run"
  if (mode === "cleanup") await cleanup()
  else await run()
})().catch((e) => { console.error(e); process.exit(1) })
