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

// Sorted longest-first so e.g. "+380" matches before "+38".
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "+380", flag: "🇺🇦", name: "Ukraine",             min: 9,  max: 9  },
  { code: "+375", flag: "🇧🇾", name: "Belarus",             min: 9,  max: 9  },
  { code: "+372", flag: "🇪🇪", name: "Estonia",             min: 7,  max: 8  },
  { code: "+371", flag: "🇱🇻", name: "Latvia",              min: 8,  max: 8  },
  { code: "+370", flag: "🇱🇹", name: "Lithuania",           min: 8,  max: 8  },
  { code: "+971", flag: "🇦🇪", name: "UAE",                 min: 9,  max: 9  },
  { code: "+856", flag: "🇱🇦", name: "Laos",                min: 8,  max: 9  },
  { code: "+855", flag: "🇰🇭", name: "Cambodia",            min: 8,  max: 9  },
  { code: "+852", flag: "🇭🇰", name: "Hong Kong",           min: 8,  max: 8  },
  { code: "+66",  flag: "🇹🇭", name: "Thailand",            min: 8,  max: 9  },
  { code: "+65",  flag: "🇸🇬", name: "Singapore",           min: 8,  max: 8  },
  { code: "+63",  flag: "🇵🇭", name: "Philippines",         min: 10, max: 10 },
  { code: "+62",  flag: "🇮🇩", name: "Indonesia",           min: 8,  max: 12 },
  { code: "+61",  flag: "🇦🇺", name: "Australia",           min: 9,  max: 9  },
  { code: "+60",  flag: "🇲🇾", name: "Malaysia",            min: 9,  max: 10 },
  { code: "+55",  flag: "🇧🇷", name: "Brazil",              min: 10, max: 11 },
  { code: "+49",  flag: "🇩🇪", name: "Germany",             min: 10, max: 11 },
  { code: "+48",  flag: "🇵🇱", name: "Poland",              min: 9,  max: 9  },
  { code: "+47",  flag: "🇳🇴", name: "Norway",              min: 8,  max: 8  },
  { code: "+46",  flag: "🇸🇪", name: "Sweden",              min: 9,  max: 9  },
  { code: "+45",  flag: "🇩🇰", name: "Denmark",             min: 8,  max: 8  },
  { code: "+44",  flag: "🇬🇧", name: "UK",                  min: 10, max: 10 },
  { code: "+43",  flag: "🇦🇹", name: "Austria",             min: 10, max: 11 },
  { code: "+41",  flag: "🇨🇭", name: "Switzerland",         min: 9,  max: 9  },
  { code: "+40",  flag: "🇷🇴", name: "Romania",             min: 9,  max: 9  },
  { code: "+39",  flag: "🇮🇹", name: "Italy",               min: 9,  max: 11 },
  { code: "+36",  flag: "🇭🇺", name: "Hungary",             min: 9,  max: 9  },
  { code: "+34",  flag: "🇪🇸", name: "Spain",               min: 9,  max: 9  },
  { code: "+33",  flag: "🇫🇷", name: "France",              min: 9,  max: 9  },
  { code: "+32",  flag: "🇧🇪", name: "Belgium",             min: 9,  max: 9  },
  { code: "+31",  flag: "🇳🇱", name: "Netherlands",         min: 9,  max: 9  },
  { code: "+30",  flag: "🇬🇷", name: "Greece",              min: 10, max: 10 },
  { code: "+27",  flag: "🇿🇦", name: "South Africa",        min: 9,  max: 9  },
  { code: "+91",  flag: "🇮🇳", name: "India",               min: 10, max: 10 },
  { code: "+90",  flag: "🇹🇷", name: "Turkey",              min: 10, max: 10 },
  { code: "+86",  flag: "🇨🇳", name: "China",               min: 11, max: 11 },
  { code: "+84",  flag: "🇻🇳", name: "Vietnam",             min: 9,  max: 10 },
  { code: "+82",  flag: "🇰🇷", name: "South Korea",         min: 9,  max: 10 },
  { code: "+81",  flag: "🇯🇵", name: "Japan",               min: 9,  max: 10 },
  { code: "+7",   flag: "🇷🇺", name: "Russia / Kazakhstan", min: 10, max: 10 },
  { code: "+1",   flag: "🇺🇸", name: "USA / Canada",        min: 10, max: 10 },
].sort((a, b) => b.code.length - a.code.length)

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

/** Pure validation: classify what state the input is in. */
export function validatePhone(value: string): PhoneValidation {
  const digits = value.replace(/\D/g, "")
  if (!value || digits.length === 0) return { kind: "empty" }
  const country = detectCountry(value)
  if (!country) {
    // 3 = our longest single-digit code is "+7", longest 3-digit is "+380".
    return digits.length > 3 ? { kind: "unknown_code" } : { kind: "empty" }
  }
  const sub = subscriberDigits(value, country)
  if (sub < country.min) return { kind: "too_short", country, have: sub }
  return { kind: "ok", country }
}
