// Studios are in Bali (UTC+8). Slot date+startTime are local studio time.
// We close bookings 2 hours before a slot starts.

const STUDIO_UTC_OFFSET = "+08:00"
const CUTOFF_MS = 2 * 60 * 60 * 1000

export function slotStartMs(date: string, startTime: string): number {
  // ISO string with explicit offset converts to UTC reliably.
  return new Date(`${date}T${startTime}:00${STUDIO_UTC_OFFSET}`).getTime()
}

export function isSlotBookable(date: string, startTime: string, nowMs = Date.now()): boolean {
  return slotStartMs(date, startTime) > nowMs + CUTOFF_MS
}
