import { prisma } from "@/lib/prisma"

// Verbose pipeline logging into the EventLog table (incident 2026-06-11:
// reminder crons silently returned 503 for weeks; console.* on Vercel Hobby
// evaporates in hours, so there was no trail).
//
// ON by default. Kill switch: set NOTIF_DEBUG=0 in env once the system has
// been observed healthy for a week or two — no redeploy of code needed.
//
// Never throws and never blocks the caller's main work: a logging failure is
// reported to console and swallowed.

const MAX_DATA_LEN = 4000

function enabled(): boolean {
  return process.env.NOTIF_DEBUG !== "0"
}

export async function elog(
  scope: string,
  message: string,
  data?: unknown,
  level: "info" | "warn" | "error" = "info",
): Promise<void> {
  if (!enabled()) return
  try {
    let payload: string | null = null
    if (data !== undefined) {
      try {
        payload = JSON.stringify(data)
      } catch {
        payload = String(data)
      }
      if (payload && payload.length > MAX_DATA_LEN) payload = payload.slice(0, MAX_DATA_LEN) + "…"
    }
    await prisma.eventLog.create({
      data: { scope, level, message, data: payload },
    })
  } catch (err) {
    console.error(`[elog:${scope}] write failed:`, err)
  }
}

export const elogWarn = (scope: string, message: string, data?: unknown) =>
  elog(scope, message, data, "warn")
export const elogError = (scope: string, message: string, data?: unknown) =>
  elog(scope, message, data, "error")
