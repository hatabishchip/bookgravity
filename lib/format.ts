// Shared display formatting. One home instead of the 10+ page-local copies
// found in the 2026-06-11 audit — the "1.35M rendered as 1.4M" ticket bug
// existed precisely because three diverging formatIDR copies drifted apart.

/** "07:30" → "7:30 AM" (12-hour, client/trainer-facing). */
export function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
}

/**
 * Compact IDR: 300000 → "300k", 1000000 → "1M", 1350000 → "1.35M".
 * Two-decimal precision, trimmed — never rounds 1.35M up to a wrong "1.4M".
 * `withUnit` appends " IDR" (booking widget style).
 */
export function formatIDRCompact(amount: number, withUnit = false): string {
  const unit = withUnit ? " IDR" : ""
  if (amount >= 1_000_000) {
    return `${Math.round((amount / 1_000_000) * 100) / 100}M${unit}`
  }
  if (amount >= 1000) return `${Math.round(amount / 1000)}k${unit}`
  return `${amount}${unit}`
}

/** Full IDR with thousand separators: 1350000 → "Rp 1.350.000" (admin salary style). */
export function formatIDRFull(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID")
}

/**
 * Currency-aware price for the booking widget. Indonesian studios stay on the
 * compact IDR style ("300k IDR"); studios with currency "USD" (e.g. the USA /
 * Online studio) render proper dollars ("$19", "$19.50"). Defaults to IDR so
 * existing studios are unaffected.
 */
export function formatMoney(amount: number, currency: string | null | undefined = "IDR"): string {
  const cur = (currency || "IDR").toUpperCase()
  if (cur === "IDR") return formatIDRCompact(amount, true)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

/**
 * Bare digits with a leading "+": "62812345678" → "+62812345678".
 * Phones are stored digits-only (normalized 2026-06-11); this is the display
 * form for admin/trainer screens and wa.me links.
 */
export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  return digits ? `+${digits}` : phone
}
