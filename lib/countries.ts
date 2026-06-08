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

// International dialing codes (digits only, no "+") for the countries above.
// Used to build a country-aware phone placeholder + prefix in the admin's
// WhatsApp activation form.
const DIAL_BY_CODE: Record<string, string> = {
  ID: "62", KZ: "7", RU: "7", UA: "380", TH: "66", VN: "84", MY: "60",
  SG: "65", PH: "63", IN: "91", AE: "971", TR: "90", GE: "995", AM: "374",
  AZ: "994", UZ: "998", KG: "996", BY: "375", PL: "48", DE: "49", FR: "33",
  ES: "34", IT: "39", PT: "351", NL: "31", GB: "44", IE: "353", CH: "41",
  AT: "43", CZ: "420", GR: "30", CY: "357", SE: "46", NO: "47", FI: "358",
  DK: "45", US: "1", CA: "1", MX: "52", BR: "55", AR: "54", AU: "61",
  NZ: "64", JP: "81", KR: "82", CN: "86", HK: "852", TW: "886", LK: "94",
  EG: "20", MA: "212", ZA: "27", IL: "972", SA: "966", QA: "974",
}

/** Dialing code (no "+") for an ISO-2 country, or "" if unknown. */
export function dialCode(code: string | null | undefined): string {
  if (!code) return ""
  return DIAL_BY_CODE[code.toUpperCase()] ?? ""
}

// Suggested cities per country for the create-studio form's city dropdown.
// Not exhaustive — the form also offers an "Other" option to type any city,
// so a new market is never blocked. Indonesia/Kazakhstan (our markets) get
// fuller lists; others get the main cities.
const CITIES_BY_COUNTRY: Record<string, string[]> = {
  ID: ["Canggu", "Ubud", "Seminyak", "Kuta", "Uluwatu", "Sanur", "Denpasar", "Jakarta", "Bandung", "Surabaya", "Yogyakarta"],
  KZ: ["Almaty", "Astana", "Shymkent", "Karaganda", "Aktobe", "Atyrau"],
  RU: ["Moscow", "Saint Petersburg", "Novosibirsk", "Yekaterinburg", "Kazan", "Sochi"],
  UA: ["Kyiv", "Lviv", "Odesa", "Kharkiv", "Dnipro"],
  TH: ["Bangkok", "Phuket", "Chiang Mai", "Pattaya", "Koh Samui"],
  VN: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Nha Trang"],
  MY: ["Kuala Lumpur", "Penang", "Johor Bahru"],
  AE: ["Dubai", "Abu Dhabi", "Sharjah"],
  TR: ["Istanbul", "Antalya", "Ankara", "Izmir"],
  GE: ["Tbilisi", "Batumi", "Kutaisi"],
  PH: ["Manila", "Cebu", "Davao"],
  IN: ["Mumbai", "Delhi", "Bengaluru", "Goa"],
  SG: ["Singapore"],
  KG: ["Bishkek", "Osh"],
  UZ: ["Tashkent", "Samarkand"],
  AM: ["Yerevan"],
  AZ: ["Baku"],
  PL: ["Warsaw", "Krakow", "Wroclaw"],
  DE: ["Berlin", "Munich", "Hamburg", "Frankfurt"],
  GB: ["London", "Manchester", "Birmingham"],
  US: ["New York", "Los Angeles", "Miami", "San Francisco", "Austin"],
}

/** Suggested cities for a country (may be empty — the form still allows a
 *  custom "Other" city). */
export function citiesFor(code: string | null | undefined): string[] {
  if (!code) return []
  return CITIES_BY_COUNTRY[code.toUpperCase()] ?? []
}
