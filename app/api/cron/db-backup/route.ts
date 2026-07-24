import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@libsql/client"
import { put, list, del } from "@vercel/blob"
import { gzipSync } from "zlib"
import { assertCronAuth } from "@/lib/cron-auth"
import { elog, elogError } from "@/lib/elog"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
// A full dump walks every table; give it room beyond the default 10s.
export const maxDuration = 60

// Daily full backup of the production Turso database into Vercel Blob.
//
// The DB is the business - bookings, payments, memberships, chat history.
// Turso's own restore options depend on plan/retention, so we keep our OWN
// independent daily dumps: every table serialized to JSON, gzipped, stored as
// db-backup/YYYY-MM-DD.json.gz. Retention: 30 days (older blobs deleted).
//
// Restore path: download the blob, then INSERT the rows table-by-table into a
// fresh database (column names are included; order follows sqlite_master).
const RETENTION_DAYS = 30

export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req)
  if (denied) return denied

  const url = process.env.DATABASE_URL
  if (!url) return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 })

  try {
    const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
    const tables = (
      await db.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'libsql_%'`,
      )
    ).rows.map((r) => String(r.name))

    const dump: Record<string, { columns: string[]; rows: unknown[][] }> = {}
    let totalRows = 0
    for (const t of tables) {
      const res = await db.execute(`SELECT * FROM "${t}"`)
      dump[t] = {
        columns: res.columns,
        rows: res.rows.map((row) => res.columns.map((c) => (row as Record<string, unknown>)[c])),
      }
      totalRows += res.rows.length
    }

    const day = new Date().toISOString().slice(0, 10)
    const body = gzipSync(Buffer.from(JSON.stringify({ takenAt: new Date().toISOString(), tables: dump })))
    const blob = await put(`db-backup/${day}.json.gz`, body, {
      access: "public", // blob URLs are unguessable; contents mirror the DB the app itself serves
      contentType: "application/gzip",
      addRandomSuffix: false,
      allowOverwrite: true, // rerunning the same day just refreshes that day's dump
    })

    // Retention sweep: drop dumps older than RETENTION_DAYS.
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    let removed = 0
    const existing = await list({ prefix: "db-backup/" })
    for (const b of existing.blobs) {
      if (new Date(b.uploadedAt).getTime() < cutoff) {
        await del(b.url).catch(() => {})
        removed++
      }
    }

    // Housekeeping piggybacked on the daily backup (audit 25.07): EventLog
    // grew ~4k rows/month with no cleanup anywhere, and BookingOtp only ever
    // cleaned per-phone. Locks (partial-unique scopes) are kept much longer -
    // deleting a lock re-arms a once-ever client nudge.
    let cleaned = 0
    try {
      const cutoff30 = new Date(Date.now() - 30 * 24 * 3600_000)
      const lockScopes = ["rebook:nudge", "ad:followup", "ig:human-agent", "wa:retry", "ig:token"]
      const r1 = await prisma.eventLog.deleteMany({
        where: { createdAt: { lt: cutoff30 }, scope: { notIn: lockScopes } },
      })
      const r2 = await prisma.bookingOtp.deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 3600_000) } },
      })
      cleaned = r1.count + r2.count
    } catch (err) {
      console.warn("[db-backup] cleanup failed:", err)
    }

    void elog("cron:db-backup", "daily dump stored", {
      day,
      tables: tables.length,
      rows: totalRows,
      bytes: body.length,
      removed,
      cleaned,
    })
    return NextResponse.json({ ok: true, day, tables: tables.length, rows: totalRows, bytes: body.length, url: blob.url, removed })
  } catch (err) {
    void elogError("cron:db-backup", "backup FAILED", { error: String(err) })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
