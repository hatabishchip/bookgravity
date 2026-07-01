// Country + format helpers for international phone numbers used by both the
// public booking widget and the trainers admin. Single source of truth so
// validation rules don't drift between forms.

export type PhoneCountry = {
  code: string
  flag: string
  name: string
  /** Min subscriber digits (everything after the country code). */
  min: number
  /** Max subscriber digits — used to block over-typing. */
  max: number
}

// Turn an ISO 3166-1 alpha-2 code into its flag emoji (regional indicators),
// so the full world table below carries just the iso code, not 200 hand-typed
// emoji (which are easy to mistype/mismatch).
function isoToFlag(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
}

// Full world dialing-code table: [code, iso2, name, minSub, maxSub] where
// min/max are subscriber digits (after the country code). The studio takes
// clients from anywhere, so EVERY country is listed - a matched code shows its
// flag + name; an unmatched code still falls back to International (see
// INTL_FALLBACK) and is accepted. min/max are precise for the studios' main
// markets and reasonable elsewhere; the real validity gate is the WhatsApp
// check, so the bands are deliberately generous rather than strict.
const RAW_COUNTRIES: [string, string, string, number, number][] = [
  // --- Studios' main markets (precise) ---
  ["+380", "UA", "Ukraine",             9,  9],
  ["+375", "BY", "Belarus",             9,  9],
  ["+372", "EE", "Estonia",             7,  8],
  ["+371", "LV", "Latvia",              8,  8],
  ["+370", "LT", "Lithuania",           8,  8],
  ["+971", "AE", "UAE",                 9,  9],
  ["+856", "LA", "Laos",                8,  9],
  ["+855", "KH", "Cambodia",            8,  9],
  ["+852", "HK", "Hong Kong",           8,  8],
  ["+66",  "TH", "Thailand",            8,  9],
  ["+65",  "SG", "Singapore",           8,  8],
  ["+63",  "PH", "Philippines",         10, 10],
  ["+62",  "ID", "Indonesia",           8,  12],
  ["+61",  "AU", "Australia",           9,  9],
  ["+60",  "MY", "Malaysia",            9,  10],
  ["+55",  "BR", "Brazil",              10, 11],
  ["+49",  "DE", "Germany",             10, 11],
  ["+48",  "PL", "Poland",              9,  9],
  ["+47",  "NO", "Norway",              8,  8],
  ["+46",  "SE", "Sweden",              9,  9],
  ["+45",  "DK", "Denmark",             8,  8],
  ["+44",  "GB", "UK",                  10, 10],
  ["+43",  "AT", "Austria",             10, 11],
  ["+41",  "CH", "Switzerland",         9,  9],
  ["+40",  "RO", "Romania",             9,  9],
  ["+39",  "IT", "Italy",               9,  11],
  ["+36",  "HU", "Hungary",             9,  9],
  ["+34",  "ES", "Spain",               9,  9],
  ["+33",  "FR", "France",              9,  9],
  ["+32",  "BE", "Belgium",             9,  9],
  ["+31",  "NL", "Netherlands",         9,  9],
  ["+30",  "GR", "Greece",              10, 10],
  ["+27",  "ZA", "South Africa",        9,  9],
  ["+91",  "IN", "India",               10, 10],
  ["+90",  "TR", "Turkey",              10, 10],
  ["+86",  "CN", "China",               11, 11],
  ["+84",  "VN", "Vietnam",             9,  10],
  ["+82",  "KR", "South Korea",         9,  10],
  ["+81",  "JP", "Japan",               9,  10],
  ["+7",   "RU", "Russia / Kazakhstan", 10, 10],
  ["+1",   "US", "USA / Canada",        10, 10],
  ["+995", "GE", "Georgia",             9,  9],
  ["+998", "UZ", "Uzbekistan",          9,  9],
  ["+996", "KG", "Kyrgyzstan",          9,  9],
  ["+972", "IL", "Israel",              9,  9],
  ["+966", "SA", "Saudi Arabia",        9,  9],
  ["+886", "TW", "Taiwan",              9,  9],
  ["+64",  "NZ", "New Zealand",         8,  10],
  // --- Rest of the world (reasonable bands; WhatsApp is the real gate) ---
  ["+20",  "EG", "Egypt",               10, 10],
  ["+211", "SS", "South Sudan",         9,  9],
  ["+212", "MA", "Morocco",             9,  9],
  ["+213", "DZ", "Algeria",             9,  9],
  ["+216", "TN", "Tunisia",             8,  8],
  ["+218", "LY", "Libya",               9,  9],
  ["+220", "GM", "Gambia",              7,  7],
  ["+221", "SN", "Senegal",             9,  9],
  ["+222", "MR", "Mauritania",          8,  8],
  ["+223", "ML", "Mali",                8,  8],
  ["+224", "GN", "Guinea",              9,  9],
  ["+225", "CI", "Cote d'Ivoire",       8,  10],
  ["+226", "BF", "Burkina Faso",        8,  8],
  ["+227", "NE", "Niger",               8,  8],
  ["+228", "TG", "Togo",                8,  8],
  ["+229", "BJ", "Benin",               8,  8],
  ["+230", "MU", "Mauritius",           7,  8],
  ["+231", "LR", "Liberia",             7,  9],
  ["+232", "SL", "Sierra Leone",        8,  8],
  ["+233", "GH", "Ghana",               9,  9],
  ["+234", "NG", "Nigeria",             8,  11],
  ["+235", "TD", "Chad",                8,  8],
  ["+236", "CF", "Central African Rep.",8,  8],
  ["+237", "CM", "Cameroon",            9,  9],
  ["+238", "CV", "Cape Verde",          7,  7],
  ["+239", "ST", "Sao Tome & Principe", 7,  7],
  ["+240", "GQ", "Equatorial Guinea",   9,  9],
  ["+241", "GA", "Gabon",               7,  8],
  ["+242", "CG", "Congo",               9,  9],
  ["+243", "CD", "DR Congo",            9,  9],
  ["+244", "AO", "Angola",              9,  9],
  ["+245", "GW", "Guinea-Bissau",       7,  7],
  ["+248", "SC", "Seychelles",          7,  7],
  ["+249", "SD", "Sudan",               9,  9],
  ["+250", "RW", "Rwanda",              9,  9],
  ["+251", "ET", "Ethiopia",            9,  9],
  ["+252", "SO", "Somalia",             7,  9],
  ["+253", "DJ", "Djibouti",            8,  8],
  ["+254", "KE", "Kenya",               9,  10],
  ["+255", "TZ", "Tanzania",            9,  9],
  ["+256", "UG", "Uganda",              9,  9],
  ["+257", "BI", "Burundi",             8,  8],
  ["+258", "MZ", "Mozambique",          9,  9],
  ["+260", "ZM", "Zambia",              9,  9],
  ["+261", "MG", "Madagascar",          9,  9],
  ["+262", "RE", "Reunion / Mayotte",   9,  9],
  ["+263", "ZW", "Zimbabwe",            9,  9],
  ["+264", "NA", "Namibia",             9,  9],
  ["+265", "MW", "Malawi",              9,  9],
  ["+266", "LS", "Lesotho",             8,  8],
  ["+267", "BW", "Botswana",            8,  8],
  ["+268", "SZ", "Eswatini",            8,  8],
  ["+269", "KM", "Comoros",             7,  7],
  ["+291", "ER", "Eritrea",             7,  7],
  ["+297", "AW", "Aruba",               7,  7],
  ["+298", "FO", "Faroe Islands",       6,  6],
  ["+299", "GL", "Greenland",           6,  6],
  ["+350", "GI", "Gibraltar",           8,  8],
  ["+351", "PT", "Portugal",            9,  9],
  ["+352", "LU", "Luxembourg",          8,  9],
  ["+353", "IE", "Ireland",             9,  9],
  ["+354", "IS", "Iceland",             7,  7],
  ["+355", "AL", "Albania",             9,  9],
  ["+356", "MT", "Malta",               8,  8],
  ["+357", "CY", "Cyprus",              8,  8],
  ["+358", "FI", "Finland",             9,  10],
  ["+359", "BG", "Bulgaria",            9,  9],
  ["+373", "MD", "Moldova",             8,  8],
  ["+374", "AM", "Armenia",             8,  8],
  ["+376", "AD", "Andorra",             6,  6],
  ["+377", "MC", "Monaco",              8,  9],
  ["+378", "SM", "San Marino",          10, 10],
  ["+381", "RS", "Serbia",              8,  9],
  ["+382", "ME", "Montenegro",          8,  8],
  ["+383", "XK", "Kosovo",              8,  8],
  ["+385", "HR", "Croatia",             8,  9],
  ["+386", "SI", "Slovenia",            8,  8],
  ["+387", "BA", "Bosnia & Herzegovina",8,  8],
  ["+389", "MK", "North Macedonia",     8,  8],
  ["+420", "CZ", "Czechia",             9,  9],
  ["+421", "SK", "Slovakia",            9,  9],
  ["+423", "LI", "Liechtenstein",       7,  7],
  ["+51",  "PE", "Peru",                9,  9],
  ["+52",  "MX", "Mexico",              10, 10],
  ["+53",  "CU", "Cuba",                8,  8],
  ["+54",  "AR", "Argentina",           10, 11],
  ["+56",  "CL", "Chile",               9,  9],
  ["+57",  "CO", "Colombia",            10, 10],
  ["+58",  "VE", "Venezuela",           10, 10],
  ["+500", "FK", "Falkland Islands",    5,  5],
  ["+501", "BZ", "Belize",              7,  7],
  ["+502", "GT", "Guatemala",           8,  8],
  ["+503", "SV", "El Salvador",         8,  8],
  ["+504", "HN", "Honduras",            8,  8],
  ["+505", "NI", "Nicaragua",           8,  8],
  ["+506", "CR", "Costa Rica",          8,  8],
  ["+507", "PA", "Panama",              7,  8],
  ["+509", "HT", "Haiti",               8,  8],
  ["+590", "GP", "Guadeloupe",          9,  9],
  ["+591", "BO", "Bolivia",             8,  8],
  ["+592", "GY", "Guyana",              7,  7],
  ["+593", "EC", "Ecuador",             8,  9],
  ["+594", "GF", "French Guiana",       9,  9],
  ["+595", "PY", "Paraguay",            9,  9],
  ["+596", "MQ", "Martinique",          9,  9],
  ["+597", "SR", "Suriname",            6,  7],
  ["+598", "UY", "Uruguay",             8,  8],
  ["+599", "CW", "Curacao",             7,  8],
  ["+670", "TL", "Timor-Leste",         8,  8],
  ["+673", "BN", "Brunei",              7,  7],
  ["+674", "NR", "Nauru",               7,  7],
  ["+675", "PG", "Papua New Guinea",    8,  8],
  ["+676", "TO", "Tonga",               5,  7],
  ["+677", "SB", "Solomon Islands",     5,  7],
  ["+678", "VU", "Vanuatu",             5,  7],
  ["+679", "FJ", "Fiji",                7,  7],
  ["+680", "PW", "Palau",               7,  7],
  ["+685", "WS", "Samoa",               5,  7],
  ["+686", "KI", "Kiribati",            5,  8],
  ["+687", "NC", "New Caledonia",       6,  6],
  ["+689", "PF", "French Polynesia",    8,  8],
  ["+691", "FM", "Micronesia",          7,  7],
  ["+692", "MH", "Marshall Islands",    7,  7],
  ["+850", "KP", "North Korea",         6,  10],
  ["+853", "MO", "Macau",               8,  8],
  ["+880", "BD", "Bangladesh",          10, 10],
  ["+960", "MV", "Maldives",            7,  7],
  ["+961", "LB", "Lebanon",             7,  8],
  ["+962", "JO", "Jordan",              9,  9],
  ["+963", "SY", "Syria",               9,  9],
  ["+964", "IQ", "Iraq",                10, 10],
  ["+965", "KW", "Kuwait",              8,  8],
  ["+967", "YE", "Yemen",               9,  9],
  ["+968", "OM", "Oman",                8,  8],
  ["+970", "PS", "Palestine",           9,  9],
  ["+973", "BH", "Bahrain",             8,  8],
  ["+974", "QA", "Qatar",               8,  8],
  ["+975", "BT", "Bhutan",              8,  8],
  ["+976", "MN", "Mongolia",            8,  8],
  ["+977", "NP", "Nepal",               10, 10],
  ["+992", "TJ", "Tajikistan",          9,  9],
  ["+993", "TM", "Turkmenistan",        8,  8],
  ["+994", "AZ", "Azerbaijan",          9,  9],
  ["+92",  "PK", "Pakistan",            10, 10],
  ["+93",  "AF", "Afghanistan",         9,  9],
  ["+94",  "LK", "Sri Lanka",           9,  9],
  ["+95",  "MM", "Myanmar",             7,  10],
  ["+98",  "IR", "Iran",                10, 10],
]

// Sorted longest-first so e.g. "+380" matches before "+38".
export const PHONE_COUNTRIES: PhoneCountry[] = RAW_COUNTRIES.map(
  ([code, iso, name, min, max]) => ({ code, flag: isoToFlag(iso), name, min, max }),
).sort((a, b) => b.code.length - a.code.length)

const PHONE_FORMATS: Record<string, string> = {
  "+380": "(##) ###-##-##",
  "+375": "(##) ###-##-##",
  "+372": "####-####",
  "+371": "####-####",
  "+370": "(#) ### ####",
  "+971": "## ### ####",
  "+856": "## ### ####",
  "+855": "## ### ###",
  "+852": "#### ####",
  "+66":  "##-####-####",
  "+65":  "####-####",
  "+63":  "### ###-####",
  "+62":  "###-####-####",
  "+61":  "###-###-###",
  "+60":  "##-####-####",
  "+55":  "(##) #####-####",
  "+49":  "### #######",
  "+48":  "###-###-###",
  "+47":  "### ## ###",
  "+46":  "##-###-##-##",
  "+45":  "##-##-##-##",
  "+44":  "#### ######",
  "+43":  "### #######",
  "+41":  "##-###-##-##",
  "+40":  "###-###-###",
  "+39":  "### ### ####",
  "+36":  "##-###-####",
  "+34":  "###-###-###",
  "+33":  "# ##-##-##-##",
  "+32":  "###-##-##-##",
  "+31":  "#-########",
  "+30":  "###-###-####",
  "+27":  "##-###-####",
  "+91":  "#####-#####",
  "+90":  "###-###-##-##",
  "+86":  "###-####-####",
  "+84":  "###-####-###",
  "+82":  "##-####-####",
  "+81":  "##-####-####",
  "+7":   "(###) ###-##-##",
  "+1":   "(###) ###-####",
}

export function detectCountry(phone: string): PhoneCountry | null {
  return PHONE_COUNTRIES.find((c) => phone.startsWith(c.code)) ?? null
}

export function subscriberDigits(phone: string, country: PhoneCountry): number {
  const codeLen = country.code.length - 1
  return phone.replace(/\D/g, "").slice(codeLen).length
}

function applyMask(digits: string, mask: string): string {
  let result = ""
  let di = 0
  for (let i = 0; i < mask.length; i++) {
    if (di >= digits.length) break
    if (mask[i] === "#") {
      result += digits[di++]
    } else if (di < digits.length) {
      result += mask[i]
    }
  }
  return result
}

/** Apply the country mask and country-code prefix to a raw "+digits" string. */
export function formatPhoneInput(rawDigitsWithPlus: string): string {
  const country = detectCountry(rawDigitsWithPlus)
  if (!country) return rawDigitsWithPlus
  const codeLen = country.code.length - 1
  const sub = rawDigitsWithPlus.replace(/\D/g, "").slice(codeLen)
  if (!sub) return country.code
  const mask = PHONE_FORMATS[country.code]
  return country.code + " " + (mask ? applyMask(sub, mask) : sub)
}

export type PhoneValidation =
  | { kind: "empty" }
  | { kind: "unknown_code" }
  | { kind: "too_short"; country: PhoneCountry; have: number }
  | { kind: "ok"; country: PhoneCountry }

// Fallback for any country code not in the curated list above. The studio gets
// clients from everywhere (Georgia +995, Uzbekistan, etc.); never hard-reject a
// plausible international number just because its country is not curated.
const INTL_FALLBACK: PhoneCountry = { code: "+", flag: "🌍", name: "International", min: 7, max: 15 }

/** Pure validation: classify what state the input is in. */
export function validatePhone(value: string): PhoneValidation {
  const digits = value.replace(/\D/g, "")
  if (!value || digits.length === 0) return { kind: "empty" }
  const country = detectCountry(value)
  if (!country) {
    // Uncurated country code: accept as a plausible international number instead
    // of blocking it. E.164 allows up to 15 digits total (incl. country code).
    if (digits.length < 4) return { kind: "empty" }                                    // just the code, keep typing
    if (digits.length < 8) return { kind: "too_short", country: INTL_FALLBACK, have: digits.length }
    if (digits.length > 15) return { kind: "unknown_code" }                            // implausibly long
    return { kind: "ok", country: INTL_FALLBACK }
  }
  const sub = subscriberDigits(value, country)
  if (sub < country.min) return { kind: "too_short", country, have: sub }
  return { kind: "ok", country }
}
