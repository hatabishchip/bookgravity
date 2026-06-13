// Client-facing class duration.
//
// A TimeSlot is stored as a 2-hour block (e.g. 11:00–13:00). That extra
// 30 minutes is buffer for the trainer — collecting payment and prepping the
// studio for the next group. Clients are ALWAYS told the class is 1.5 hours.
//
// So everywhere we show a class time TO A CLIENT (booking page, confirmation,
// reminders), we render start → start+90min. Everywhere it's for the trainer
// or admin (schedule, conflicts, trainer notifications) we keep the real
// 2-hour slot. This module is the single source of truth for the 90 minutes.

export const CLIENT_CLASS_MINUTES = 90

function addMinutes(hhmm: string, mins: number): { h: number; m: number } {
  const [h, m] = (hhmm || "").split(":").map(Number)
  const total = (h || 0) * 60 + (m || 0) + mins
  return { h: Math.floor(total / 60) % 24, m: total % 60 }
}

/** Client-facing end time in 24h "HH:MM" (start + 90min). */
export function clientEndTime24(startTime: string): string {
  const { h, m } = addMinutes(startTime, CLIENT_CLASS_MINUTES)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Client-facing end time in 12h "h:MM AM/PM" (start + 90min). */
export function clientEndTime12(startTime: string): string {
  const { h, m } = addMinutes(startTime, CLIENT_CLASS_MINUTES)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

/** Client-facing class range in 24h, e.g. "11:00–12:30". Start kept as stored. */
export function clientClassRange(startTime: string): string {
  return `${startTime}–${clientEndTime24(startTime)}`
}

/** Class START time in 12h, lowercase, e.g. "11:00 am" / "3:00 pm". Used by
 *  the day-before reminder, which shows only the start (class length varies
 *  75–90+ min, so an end time would risk collisions). No +90 here. */
export function clientStartTime12(startTime: string): string {
  const [h, m] = (startTime || "").split(":").map(Number)
  const hh = (h || 0) % 12 || 12
  const ap = (h || 0) >= 12 ? "pm" : "am"
  return `${hh}:${String(m || 0).padStart(2, "0")} ${ap}`
}
