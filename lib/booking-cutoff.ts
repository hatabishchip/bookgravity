// Studios are in Bali (UTC+8). Slot date+startTime are local studio time.
// We close bookings 2.5 hours before a slot starts (owner rule 2026-06-12;
// matches the same-day reminder window).

const STUDIO_UTC_OFFSET = "+08:00"
const CUTOFF_MS = 2.5 * 60 * 60 * 1000

export function slotStartMs(date: string, startTime: string): number {
  // ISO string with explicit offset converts to UTC reliably.
  return new Date(`${date}T${startTime}:00${STUDIO_UTC_OFFSET}`).getTime()
}

// When the class ends (studio-local). Used to keep an in-progress class visible
// (greyed, "booking closed") until it actually finishes, instead of hiding it
// the moment it starts.
export function slotEndMs(date: string, endTime: string): number {
  return new Date(`${date}T${endTime}:00${STUDIO_UTC_OFFSET}`).getTime()
}

export function isSlotBookable(date: string, startTime: string, nowMs = Date.now()): boolean {
  return slotStartMs(date, startTime) > nowMs + CUTOFF_MS
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
): boolean {
  if (bookedCount >= 1) return slotEndMs(date, endTime) > nowMs
  return isSlotBookable(date, startTime, nowMs)
}
