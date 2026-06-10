import {
  addMonths, endOfMonth, endOfWeek, format, getDay, getDaysInMonth,
  isAfter, isBefore, isSameDay, isToday, parseISO, startOfMonth, startOfWeek,
} from "date-fns"

// Date utilities centralised here so the screens don't import date-fns
// directly. Keeps the wire-up identical across iOS / Android / future web
// embeds, and makes locale / timezone changes a one-file diff.

export const todayDate = (): Date => new Date()

export const ymd = (d: Date): string => format(d, "yyyy-MM-dd")

export const monthKey = (d: Date): string => format(d, "yyyy-MM")

export const prettyMonth = (d: Date): string => format(d, "MMMM yyyy")

// Returns the 6-week grid (Mon-first) covering the month containing `d`.
// We always render full weeks so the calendar's height doesn't change as the
// user swipes between months.
export function monthGridDays(d: Date): Date[] {
  const start = startOfWeek(startOfMonth(d), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(d), { weekStartsOn: 1 })
  const days: Date[] = []
  for (let cur = start; !isAfter(cur, end); cur = addMonths(cur, 0)) {
    days.push(cur)
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }
  return days
}

// Client-facing class duration: a slot is stored as a 2-hour block, but the
// extra 30 minutes is the trainer's payment/prep buffer. Clients are ALWAYS
// told the class is 1.5 hours. Mirror of web lib/class-time.ts.
export const CLIENT_CLASS_MINUTES = 90

/** Client-facing end time "HH:MM" (start + 90min). */
export function clientEndTime(startTime: string): string {
  const [h, m] = (startTime || "").split(":").map(Number)
  const total = (h || 0) * 60 + (m || 0) + CLIENT_CLASS_MINUTES
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`
}

/** Client-facing class range "11:00 – 12:30". */
export function clientClassRange(startTime: string): string {
  return `${startTime} – ${clientEndTime(startTime)}`
}

export {
  addMonths, format, getDay, getDaysInMonth, isAfter, isBefore, isSameDay,
  isToday, parseISO, startOfMonth, startOfWeek,
}
