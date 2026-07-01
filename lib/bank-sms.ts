// Parse a bank payment SMS forwarded from the studio owner's phone into a
// structured record. Today only BRI QRIS incoming notifications are seen; the
// parser is deliberately tolerant (extra spaces, line-order independence) and
// returns null for anything it does not recognise as an INCOMING payment, so
// balance alerts, OTP texts and other noise are simply ignored by the webhook.
//
// Real samples (Canggu, June 2026), lines separated by newlines:
//   Transaksi QR Telah Diterima.
//   Nominal :  600000
//   Jam :  2026-06-03 14:34:35
//   Nomor Referensi :  030626234404
//
// Notes:
// - There is NO sender/payer name in the SMS, so a payment can only be tied to
//   a booking by amount + time (done by hand in the admin, with suggestions).
// - "Jam" is the phone's local wall clock = Bali time (WITA, UTC+8, no DST).
// - Amount is plain rupiah with no separators; we strip non-digits defensively
//   in case a future format uses "1.500.000" thousands dots.

import { BALI_TZ } from "@/lib/tz"

export type ParsedBankSms = {
  /** Amount in the smallest whole currency unit shown (IDR rupiah). */
  amount: number
  /** Exact instant of payment (parsed from "Jam" as Bali local time). */
  paidAt: Date
  /** Bank reference number - unique per transaction, used to de-duplicate. */
  reference: string | null
  /** Coarse channel label derived from the header, e.g. "QRIS". */
  channel: string
  /** The wall-clock string as printed in the SMS ("2026-06-03 14:34:35"). */
  paidAtLocal: string | null
}

/** True when a line is the BRI "money received" header we act on. */
function isIncomingHeader(text: string): boolean {
  // "Transaksi QR Telah Diterima." and close variants. "Diterima" = received.
  // We only record credits; a debit/outgoing SMS would say "Anda telah" etc.
  return /telah\s+diterima/i.test(text)
}

function extractAmount(text: string): number | null {
  // "Nominal :  600000" - value may have currency prefix / thousands dots.
  const m = text.match(/Nominal\s*:?\s*(?:IDR|Rp\.?)?\s*([\d.,\s]+)/i)
  if (!m) return null
  // Keep digits only. Handles "600000", "1.500.000", "Rp 350.000".
  const digits = m[1].replace(/\D/g, "")
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) && n > 0 ? n : null
}

function extractReference(text: string): string | null {
  // "Nomor Referensi :  030626234404" - alphanumeric, keep as-is.
  const m = text.match(/Nomor\s*Referensi\s*:?\s*([A-Za-z0-9]+)/i)
  return m ? m[1] : null
}

/**
 * Parse the "Jam : 2026-06-03 14:34:35" wall-clock (Bali local time) into a
 * real instant. We anchor it to WITA (+08:00) so the stored Date is the correct
 * UTC moment regardless of where the server runs.
 */
function extractPaidAt(text: string): { date: Date; local: string } | null {
  const m = text.match(
    /Jam\s*:?\s*(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/i,
  )
  if (!m) return null
  const [, y, mo, d, hh, mm, ss] = m
  const local = `${y}-${mo}-${d} ${hh}:${mm}:${ss ?? "00"}`
  // Bali is a fixed +08:00 offset (no DST), so an ISO string with +08:00 is the
  // unambiguous instant. BALI_TZ is referenced to keep the offset intent close
  // to the shared tz module even though the offset itself is hard-coded here.
  void BALI_TZ
  const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss ?? "00"}+08:00`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : { date, local }
}

/**
 * Parse a forwarded bank SMS. Returns null when the text is not a recognised
 * incoming payment (so the webhook can quietly ignore unrelated messages).
 */
export function parseBankSms(raw: string): ParsedBankSms | null {
  if (!raw || typeof raw !== "string") return null
  const text = raw.replace(/\r/g, "")

  if (!isIncomingHeader(text)) return null

  const amount = extractAmount(text)
  const paid = extractPaidAt(text)
  // An incoming header with no amount is not something we can record.
  if (amount == null) return null

  const channel = /\bQR(IS)?\b/i.test(text) ? "QRIS" : "TRANSFER"

  return {
    amount,
    paidAt: paid?.date ?? new Date(),
    paidAtLocal: paid?.local ?? null,
    reference: extractReference(text),
    channel,
  }
}
