import { prisma } from "@/lib/prisma"

// Booking ticket codes are ALWAYS 3 digits (100-999). The cancel bot matches
// them with a \d{3} pattern and the WhatsApp templates render 3 digits, so the
// format must never drift (a 4-digit fallback once slipped into the trainer path
// and would never match the cancel bot). This is the single generator used by
// every booking-create path.

const rand3 = () => String(Math.floor(100 + Math.random() * 900))

/** N distinct 3-digit codes not already used by CONFIRMED bookings on the slot. */
export async function generateUniqueTicketCodes(slotId: string, count: number): Promise<string[]> {
  const existing = await prisma.booking.findMany({
    where: { slotId, status: "CONFIRMED" },
    select: { ticketCode: true },
  })
  const used = new Set(existing.map((b) => b.ticketCode))
  const codes: string[] = []
  // Cap attempts so a nearly-full 900-code space can't spin forever.
  for (let attempts = 0; codes.length < count && attempts < 5000; attempts++) {
    const code = rand3()
    if (used.has(code)) continue
    used.add(code)
    codes.push(code)
  }
  return codes
}

/** One distinct 3-digit code for the slot (3-digit fallback, never 4). */
export async function generateUniqueTicketCode(slotId: string): Promise<string> {
  const [code] = await generateUniqueTicketCodes(slotId, 1)
  return code ?? rand3()
}
