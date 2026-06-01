// WhatsApp Click-to-Chat helpers

/**
 * Build a wa.me URL with pre-filled message.
 * Phone is sanitized to digits only (international format expected).
 */
export function whatsappLink(phone: string, message: string): string | null {
  const digits = phone.replace(/\D/g, "")
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export function bookingConfirmationMessage(opts: {
  clientName: string
  date: string // pretty date string
  time: string
  ticketCode: string
  partySize?: number
  /** Full studio name, e.g. "Gravity Stretching Ubud". Falls back to brand. */
  studioName?: string
  /** Maps link to the studio — appended as a "Location" line when present. */
  locationUrl?: string | null
}): string {
  const partyText = opts.partySize && opts.partySize > 1 ? ` (${opts.partySize} people)` : ""
  const studio = (opts.studioName && opts.studioName.trim()) || "Gravity Stretching"
  const lines = [
    `🌿 *${studio}* 🌿`,
    ``,
    `Hi ${opts.clientName}! Your booking is confirmed${partyText}.`,
    ``,
    `📅 ${opts.date}`,
    `⏰ ${opts.time}`,
    `🎟 Code: *${opts.ticketCode}*`,
  ]
  if (opts.locationUrl && opts.locationUrl.trim()) {
    lines.push(``, `📍 Location: ${opts.locationUrl.trim()}`)
  }
  lines.push(``, `Show this code to your trainer when you arrive.`, `See you on the mat!`)
  return lines.join("\n")
}

export function trainerNotificationMessage(opts: {
  trainerName: string
  date: string
  time: string
  clientName: string
  clientPhone: string
  partySize?: number
}): string {
  const partyText = opts.partySize && opts.partySize > 1 ? ` (+${opts.partySize - 1} more)` : ""
  return [
    `Hi ${opts.trainerName} 👋`,
    ``,
    `New booking for your class:`,
    `📅 ${opts.date}`,
    `⏰ ${opts.time}`,
    `👤 ${opts.clientName}${partyText}`,
    `📞 ${opts.clientPhone}`,
  ].join("\n")
}

export function trainerReminderMessage(opts: {
  trainerName: string
  date: string
  time: string
  bookingsCount: number
}): string {
  return [
    `Hi ${opts.trainerName} 👋`,
    ``,
    `Reminder: you have a class in 1 hour.`,
    `📅 ${opts.date}`,
    `⏰ ${opts.time}`,
    `👥 ${opts.bookingsCount} client(s) booked`,
  ].join("\n")
}
