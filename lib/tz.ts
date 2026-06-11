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

/** YYYY-MM-DD shifted by n calendar days (string math, no TZ surprises). */
export function addDaysStr(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}
