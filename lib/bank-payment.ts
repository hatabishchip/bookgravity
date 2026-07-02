import { prisma } from "@/lib/prisma"
import { parseBankSms } from "@/lib/bank-sms"

// Shared recorder for a bank payment parsed from a forwarded message, used by
// BOTH ingest paths: the SMS forwarder webhook (/api/payments/sms-inbound) and
// the WhatsApp Cloud API webhook (when the studio routes its bank's WhatsApp
// notifications to its business number). Keeps parsing + de-duplication in one
// place so both paths behave identically.

export type RecordResult =
  | { status: "ignored" } // not a recognised bank-payment message
  | { status: "duplicate"; id: string }
  | { status: "created"; id: string; amount: number; reference: string | null }

/**
 * Parse `text` as a bank payment and store it for `studioId`, unless it isn't a
 * payment message ("ignored") or the same transaction is already recorded
 * ("duplicate"). `sender` is the SMS sender / WhatsApp number it came from.
 */
export async function recordBankPayment(opts: {
  studioId: string
  text: string
  sender?: string | null
  /** Which ingest path recorded this - "sms" (forwarder) or "wa" (WhatsApp). */
  source?: "sms" | "wa"
}): Promise<RecordResult> {
  const parsed = parseBankSms(opts.text)
  if (!parsed) return { status: "ignored" }

  const text = opts.text.trim()
  // Idempotency: a re-forwarded message must not create a second row. Prefer the
  // bank reference; fall back to amount+time+text when the format carries none.
  const dupWhere = parsed.reference
    ? { studioId: opts.studioId, reference: parsed.reference }
    : { studioId: opts.studioId, amount: parsed.amount, paidAt: parsed.paidAt, rawText: text }

  const existing = await prisma.bankPayment.findFirst({ where: dupWhere, select: { id: true } })
  if (existing) return { status: "duplicate", id: existing.id }

  try {
    const row = await prisma.bankPayment.create({
      data: {
        studioId: opts.studioId,
        amount: parsed.amount,
        reference: parsed.reference,
        channel: parsed.channel,
        source: opts.source ?? "sms",
        sender: opts.sender ?? null,
        rawText: text,
        paidAt: parsed.paidAt,
      },
      select: { id: true },
    })
    return { status: "created", id: row.id, amount: parsed.amount, reference: parsed.reference }
  } catch (err) {
    // Unique (studioId, reference) race - another request won; treat as dupe.
    const msg = err instanceof Error ? err.message : String(err)
    if (/unique|constraint/i.test(msg)) {
      const row = await prisma.bankPayment.findFirst({ where: dupWhere, select: { id: true } })
      if (row) return { status: "duplicate", id: row.id }
    }
    throw err
  }
}
