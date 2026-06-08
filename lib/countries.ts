// ISO 3166-1 alpha-2 country helpers. Used by the super-admin studio form
// (country <select>) and the public chooser (group studios by country with a
// flag). The flag emoji is derived from the 2-letter code, so any valid code
// renders a flag without a lookup table.

/** Turn an ISO-2 code ("KZ") into its flag emoji (🇰🇿). */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "🏳️"
  const cc = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return "🏳️"
  return String.fromCodePoint(
    ...cc.split("").map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65)),
  )
}

// Broad country list for the create-studio <select>. English names; the flag
// is computed. Not every UN member — a generous, practical set that covers all
// regions; add more freely as the business expands.
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "ID", name: "Indonesia" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "RU", name: "Russia" },
  { code: "UA", name: "Ukraine" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" },
  { code: "PH", name: "Philippines" },
  { code: "IN", name: "India" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "TR", name: "Turkey" },
  { code: "GE", name: "Georgia" },
  { code: "AM", name: "Armenia" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "BY", name: "Belarus" },
  { code: "PL", name: "Poland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },
  { code: "NL", name: "Netherlands" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "CH", name: "Switzerland" },
  { code: "AT", name: "Austria" },
  { code: "CZ", name: "Czechia" },
  { code: "GR", name: "Greece" },
  { code: "CY", name: "Cyprus" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "FI", name: "Finland" },
  { code: "DK", name: "Denmark" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "HK", name: "Hong Kong" },
  { code: "TW", name: "Taiwan" },
  { code: "LK", name: "Sri Lanka" },
  { code: "EG", name: "Egypt" },
  { code: "MA", name: "Morocco" },
  { code: "ZA", name: "South Africa" },
  { code: "IL", name: "Israel" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
]

const NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.name]),
)

/** Display name for a code; falls back to the code itself if unknown. */
export function countryName(code: string | null | undefined): string {
  if (!code) return ""
  return NAME_BY_CODE[code.toUpperCase()] ?? code.toUpperCase()
}
