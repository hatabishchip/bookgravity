// Slot date+startTime are stored in the studio's LOCAL time. We close bookings
// 2.5 hours before a slot starts (owner rule 2026-06-12; matches the same-day
// reminder window).
//
// Timezone: every function takes an optional IANA `timeZone`. It defaults to
// Bali (WITA, +08:00, no DST) so the live studios behave exactly as before; a
// studio in another zone (Studio.timezone) passes its own so its cutoff/close
// windows land at the right local moment instead of ~Bali-3h.

import { tzOffset, BALI_TZ } from "@/lib/tz"

const CUTOFF_MS = 2.5 * 60 * 60 * 1000

export function slotStartMs(date: string, startTime: string, timeZone: string = BALI_TZ): number {
  // ISO string with explicit offset converts to UTC reliably.
  return new Date(`${date}T${startTime}:00${tzOffset(date, timeZone)}`).getTime()
}

// When the class ends (studio-local). Used to keep an in-progress class visible
// (greyed, "booking closed") until it actually finishes, instead of hiding it
// the moment it starts.
export function slotEndMs(date: string, endTime: string, timeZone: string = BALI_TZ): number {
  return new Date(`${date}T${endTime}:00${tzOffset(date, timeZone)}`).getTime()
}

export function isSlotBookable(
  date: string,
  startTime: string,
  nowMs = Date.now(),
  timeZone: string = BALI_TZ,
): boolean {
  return slotStartMs(date, startTime, timeZone) > nowMs + CUTOFF_MS
}

/**
 * Booking availability that accounts for existing attendees: a class with at
 * least one person already booked stays OPEN for booking right up until it
 * ends (so latecomers can still join an already-running class), and closes the
 * moment it finishes. An empty class follows the normal 2.5-hour cutoff.
 */
export function isSlotBookableWithAttendees(
  date: string,
  startTime: string,
  endTime: string,
  bookedCount: number,
  nowMs = Date.now(),
  timeZone: string = BALI_TZ,
): boolean {
  if (bookedCount >= 1) return slotEndMs(date, endTime, timeZone) > nowMs
  return isSlotBookable(date, startTime, nowMs, timeZone)
}
