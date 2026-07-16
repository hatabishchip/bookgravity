// E2E acceptance for the inversion-clearance gate (docs/META_inversion_clearance.md item 7).
// Runs against PROD Turso data directly + prod HTTP API.
//
// Usage:
//   npx tsx scripts/e2e-inversion-clearance.ts verify   - full check (creates temp assistant trainer, flips clearance, cleans up)
//   npx tsx scripts/e2e-inversion-clearance.ts cleanup  - remove leftovers only
//
// What it proves, on a real future Ubud slot whose trainer has NO clearance:
//   1. /api/slots shows allowsInversions=false for the slot.
//   2. POST /api/bookings with the inversion service -> 400 (server gate).
//   3. Assign a temp assistant WITH clearance -> /api/slots flips to true.
//   4. Remove assistant -> back to false. All temp data deleted.
import 'dotenv/config'
import { createClient } from '@libsql/client'

const url = process.env.DATABASE_URL!
const authToken = process.env.TURSO_AUTH_TOKEN!
const db = createClient({ url, authToken })
const BASE = 'https://bookgravity.com'
const TMP_NAME = 'E2E Inversion Assistant (temp)'

async function findUbud() {
  const r = await db.execute(`SELECT id, slug FROM Studio WHERE slug LIKE '%ubud%' LIMIT 1`)
  if (!r.rows.length) throw new Error('Ubud studio not found')
  return r.rows[0] as unknown as { id: string; slug: string }
}

async function cleanup() {
  const t = await db.execute({ sql: `SELECT id FROM Trainer WHERE name = ?`, args: [TMP_NAME] })
  for (const row of t.rows) {
    const id = row.id as string
    await db.execute({ sql: `UPDATE TimeSlot SET assistantId = NULL WHERE assistantId = ?`, args: [id] })
    const u = await db.execute({ sql: `SELECT userId FROM Trainer WHERE id = ?`, args: [id] })
    await db.execute({ sql: `DELETE FROM Trainer WHERE id = ?`, args: [id] })
    if (u.rows[0]?.userId) await db.execute({ sql: `DELETE FROM User WHERE id = ?`, args: [u.rows[0].userId as string] })
    console.log(`cleaned temp trainer ${id}`)
  }
  if (!t.rows.length) console.log('no leftovers')
}

async function slotFromApi(slug: string, date: string, slotId: string) {
  const res = await fetch(`${BASE}/api/slots?date=${date}&studio=${slug}`)
  const list = (await res.json()) as { id: string; allowsInversions?: boolean }[]
  return list.find((s) => s.id === slotId)
}

async function verify() {
  const studio = await findUbud()

  // Inversion-flagged service (marked in prod on 16.07).
  const svc = await db.execute({
    sql: `SELECT id, name FROM AdditionalService WHERE studioId = ? AND requiresInversionClearance = 1 LIMIT 1`,
    args: [studio.id],
  })
  if (!svc.rows.length) throw new Error('no inversion-flagged service in Ubud')
  const serviceId = svc.rows[0].id as string
  console.log(`service: ${svc.rows[0].name} (${serviceId})`)

  // Future slot whose trainer has NO clearance and no assistant.
  const slot = await db.execute({
    sql: `SELECT ts.id, ts.date, ts.startTime, tr.name AS trainerName
          FROM TimeSlot ts JOIN Trainer tr ON tr.id = ts.trainerId
          WHERE ts.studioId = ? AND ts.date > date('now') AND ts.assistantId IS NULL
            AND tr.permInvertedPositions = 0 AND ts.classType = 'GROUP'
          ORDER BY ts.date, ts.startTime LIMIT 1`,
    args: [studio.id],
  })
  if (!slot.rows.length) throw new Error('no future uncleard slot found')
  const s = slot.rows[0] as unknown as { id: string; date: string; startTime: string; trainerName: string }
  console.log(`slot: ${s.date} ${s.startTime} (${s.trainerName}, no clearance)`)

  // 1) widget data: allowsInversions must be false
  const before = await slotFromApi(studio.slug, s.date, s.id)
  if (!before) throw new Error('slot not in /api/slots')
  console.log(`1. /api/slots allowsInversions=${before.allowsInversions} ${before.allowsInversions === false ? 'OK' : 'FAIL'}`)

  // 2) server gate: booking with the service must 400
  const resp = await fetch(`${BASE}/api/bookings?studio=${studio.slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slotId: s.id, clientName: 'E2E Inversion Test', clientPhone: '+6281999000111',
      serviceIds: [serviceId], partySize: 1,
    }),
  })
  const body = await resp.text()
  console.log(`2. POST gate -> ${resp.status} ${resp.status === 400 && body.includes('not certified') ? 'OK' : `UNEXPECTED: ${body.slice(0, 200)}`}`)

  // 3) temp assistant WITH clearance -> flag flips to true
  const trainerId = 'e2einv' + Date.now().toString(36)
  const userId = 'e2einvu' + Date.now().toString(36)
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO User (id, email, password, role, studioId, updatedAt, createdAt)
          VALUES (?, ?, 'x-no-login', 'TRAINER', ?, ?, ?)`,
    args: [userId, `${userId}@test.local`, studio.id, now, now],
  })
  await db.execute({
    sql: `INSERT INTO Trainer (id, userId, name, studioId, whatsapp, permInvertedPositions, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, '', 1, ?, ?)`,
    args: [trainerId, userId, TMP_NAME, studio.id, now, now],
  })
  await db.execute({ sql: `UPDATE TimeSlot SET assistantId = ? WHERE id = ?`, args: [trainerId, s.id] })
  const after = await slotFromApi(studio.slug, s.date, s.id)
  console.log(`3. with cleared assistant allowsInversions=${after?.allowsInversions} ${after?.allowsInversions === true ? 'OK' : 'FAIL'}`)

  // 4) rollback + confirm
  await db.execute({ sql: `UPDATE TimeSlot SET assistantId = NULL WHERE id = ?`, args: [s.id] })
  await db.execute({ sql: `DELETE FROM Trainer WHERE id = ?`, args: [trainerId] })
  await db.execute({ sql: `DELETE FROM User WHERE id = ?`, args: [userId] })
  const rolled = await slotFromApi(studio.slug, s.date, s.id)
  console.log(`4. rollback allowsInversions=${rolled?.allowsInversions} ${rolled?.allowsInversions === false ? 'OK' : 'FAIL'} (temp data removed)`)
}

;(async () => {
  const mode = process.argv[2] ?? 'verify'
  if (mode === 'cleanup') await cleanup()
  else await verify()
})().catch((e) => { console.error(e); process.exit(1) })
