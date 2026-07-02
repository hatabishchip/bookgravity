// Studio-local calendar math. Single home for the timezone constant and the
// "what date is it at the studio" helpers that used to be copy-pasted across
// crons, trainer APIs and pages (5+ copies, audit 2026-06-11).
//
// Studios are in Bali today; Studio.timezone (nullable, default WITA) exists
// for the day one opens elsewhere — pass it through where you have a studio
// row, omit it everywhere else.

export const BALI_TZ = "Asia/Makassar" // WITA, UTC+8, no DST

/** YYYY-MM-DD of `d` in the studio's timezone (en-CA renders ISO order). */
export function studioDateStr(d: Date, timeZone: string = BALI_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

/** Back-compat alias — most call sites are Bali-only. */
export const baliDateStr = (d: Date) => studioDateStr(d)

/**
 * UTC offset like "+08:00" for a wall date in a timezone, so a studio-local
 * "date + HH:mm" can be turned into a real instant. Bali (WITA) is a fixed
 * +08:00 with no DST, so that path is a constant - guaranteeing zero change for
 * the live studios; other zones are derived from Intl for the given date.
 */
export function tzOffset(date: string, timeZone: string = BALI_TZ): string {
  if (timeZone === BALI_TZ) return "+08:00"
  try {
    const d = new Date(`${date}T12:00:00Z`)
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? ""
    const m = name.match(/([+-])(\d{2}):?(\d{2})/)
    if (m) return `${m[1]}${m[2]}:${m[3]}`
  } catch {
    /* fall through to Bali default */
  }
  return "+08:00"
}

/** YYYY-MM-DD shifted by n calendar days (string math, no TZ surprises). */
export function addDaysStr(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}
