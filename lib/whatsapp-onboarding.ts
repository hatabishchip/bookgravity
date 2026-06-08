// Wrappers around Meta Cloud API endpoints used during a studio's
// self-service WhatsApp activation:
//
//   1. addPhoneToWaba          — POST /{waba_id}/phone_numbers
//   2. requestVerificationCode — POST /{phone_id}/request_code
//   3. verifyCode              — POST /{phone_id}/verify_code
//   4. registerPhone           — POST /{phone_id}/register
//
// Each call uses the same `WHATSAPP_ACCESS_TOKEN` System User token that
// already powers Canggu — adding a new phone to the existing WABA does
// NOT require re-issuing a token, since the System User has WABA-level
// access. The fixed `WHATSAPP_BUSINESS_ACCOUNT_ID` env (or 1571637721189360
// hardcoded as fallback) is the WABA we attach new numbers to.
//
// All helpers are best-effort and return `{ ok: true, ... }` or
// `{ ok: false, error: string }` — they never throw, so the API route
// layer can pattern-match on the error and surface user-friendly text.

const GRAPH_BASE = "https://graph.facebook.com"
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0"

// The WABA all studios attach to. Falls back to the Canggu WABA the
// existing setup uses — keeps the env optional in single-tenant deploys.
const DEFAULT_WABA_ID =
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "1571637721189360"

type ApiOk<T = Record<string, unknown>> = { ok: true } & T
type ApiErr = { ok: false; error: string; code?: number; raw?: unknown }

function getToken(): string | null {
  return process.env.WHATSAPP_ACCESS_TOKEN || null
}

/** Strip leading "+" / spaces / dashes so Meta gets bare digits. */
function digits(s: string): string {
  return (s || "").replace(/\D/g, "")
}

/** Split "+62 812 3456 789" into { cc: "62", phone_number: "8123456789" }. */
export function splitCountryAndNumber(
  formatted: string,
): { cc: string; phoneNumber: string } | null {
  const d = digits(formatted)
  if (d.length < 8 || d.length > 16) return null
  // Country code lengths vary 1-3 digits. Common picks; for the rest we
  // fall back to 1-digit guess (works for +1, +7) or 2-digit (most others).
  const known: Record<string, number> = {
    "1": 1, "7": 1, // NANP, RU/KZ
    "20": 2, "27": 2, "30": 2, "31": 2, "32": 2, "33": 2, "34": 2, "36": 2,
    "39": 2, "40": 2, "41": 2, "43": 2, "44": 2, "45": 2, "46": 2, "47": 2,
    "48": 2, "49": 2, "51": 2, "52": 2, "53": 2, "54": 2, "55": 2, "56": 2,
    "57": 2, "58": 2, "60": 2, "61": 2, "62": 2, "63": 2, "64": 2, "65": 2,
    "66": 2, "81": 2, "82": 2, "84": 2, "86": 2, "90": 2, "91": 2, "92": 2,
    "93": 2, "94": 2, "95": 2, "98": 2,
    "211": 3, "212": 3, "213": 3, "216": 3, "218": 3, "220": 3, "221": 3,
    "222": 3, "223": 3, "224": 3, "225": 3, "226": 3, "227": 3, "228": 3,
    "229": 3, "230": 3, "231": 3, "232": 3, "233": 3, "234": 3, "235": 3,
    "236": 3, "237": 3, "238": 3, "239": 3, "240": 3, "241": 3, "242": 3,
    "243": 3, "244": 3, "245": 3, "248": 3, "249": 3, "250": 3, "251": 3,
    "252": 3, "253": 3, "254": 3, "255": 3, "256": 3, "257": 3, "258": 3,
    "260": 3, "261": 3, "262": 3, "263": 3, "264": 3, "265": 3, "266": 3,
    "267": 3, "268": 3, "269": 3, "350": 3, "351": 3, "352": 3, "353": 3,
    "354": 3, "355": 3, "356": 3, "357": 3, "358": 3, "359": 3, "370": 3,
    "371": 3, "372": 3, "373": 3, "374": 3, "375": 3, "376": 3, "377": 3,
    "378": 3, "380": 3, "381": 3, "382": 3, "383": 3, "385": 3, "386": 3,
    "387": 3, "389": 3, "420": 3, "421": 3, "423": 3, "501": 3, "502": 3,
    "503": 3, "504": 3, "505": 3, "506": 3, "507": 3, "591": 3, "592": 3,
    "593": 3, "594": 3, "595": 3, "597": 3, "598": 3, "599": 3, "670": 3,
    "672": 3, "673": 3, "674": 3, "675": 3, "676": 3, "677": 3, "678": 3,
    "679": 3, "680": 3, "681": 3, "682": 3, "683": 3, "685": 3, "686": 3,
    "687": 3, "688": 3, "689": 3, "690": 3, "691": 3, "692": 3, "850": 3,
    "852": 3, "853": 3, "855": 3, "856": 3, "880": 3, "886": 3, "960": 3,
    "961": 3, "962": 3, "963": 3, "964": 3, "965": 3, "966": 3, "967": 3,
    "968": 3, "970": 3, "971": 3, "972": 3, "973": 3, "974": 3, "975": 3,
    "976": 3, "977": 3, "992": 3, "993": 3, "994": 3, "995": 3, "996": 3,
    "998": 3,
  }
  // Try 3, 2, 1-digit country code matches in order — pick the most specific.
  for (const len of [3, 2, 1] as const) {
    const candidate = d.slice(0, len)
    if (known[candidate] === len) {
      return { cc: candidate, phoneNumber: d.slice(len) }
    }
  }
  // Unknown country code — assume 2 digits.
  return { cc: d.slice(0, 2), phoneNumber: d.slice(2) }
}

/** Generate a deterministic-looking but pseudo-random 6-digit PIN. */
export function generateTwoFactorPin(): string {
  // Crypto-grade is overkill; we just need un-guessable from outside.
  let pin = ""
  for (let i = 0; i < 6; i++) pin += Math.floor(Math.random() * 10)
  return pin
}

/**
 * Add a phone to the studio's WABA. Returns the new phone_number_id.
 * Fails if Meta rejects the verified_name or the number is already in
 * use elsewhere.
 */
export async function addPhoneToWaba(opts: {
  countryCode: string
  phoneNumber: string
  verifiedName: string
  wabaId?: string
}): Promise<ApiOk<{ phoneNumberId: string }> | ApiErr> {
  const token = getToken()
  if (!token) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN not set" }
  const wabaId = opts.wabaId || DEFAULT_WABA_ID
  const url = `${GRAPH_BASE}/${API_VERSION}/${wabaId}/phone_numbers`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cc: opts.countryCode,
        phone_number: opts.phoneNumber,
        verified_name: opts.verifiedName,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      id?: string
      error?: { message?: string; code?: number; error_user_msg?: string }
    }
    if (!res.ok || !json.id) {
      // The number may already be on this WABA from an earlier attempt that
      // timed out (504) after Meta added it but before we saved the id. Look
      // it up and reuse it so a retry is idempotent instead of failing with
      // "already added".
      const existing = await findPhoneNumberId({
        countryCode: opts.countryCode,
        phoneNumber: opts.phoneNumber,
        wabaId,
      })
      if (existing) return { ok: true, phoneNumberId: existing }
      return {
        ok: false,
        error:
          json.error?.error_user_msg ||
          json.error?.message ||
          `HTTP ${res.status}`,
        code: json.error?.code,
        raw: json,
      }
    }
    return { ok: true, phoneNumberId: json.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Find an existing phone on the WABA matching cc+number → its phone_number_id,
 *  or null. Used to recover from a timed-out add (the number is already there). */
async function findPhoneNumberId(opts: {
  countryCode: string
  phoneNumber: string
  wabaId: string
}): Promise<string | null> {
  const token = getToken()
  if (!token) return null
  const want = (opts.countryCode + opts.phoneNumber).replace(/\D/g, "")
  try {
    const url = `${GRAPH_BASE}/${API_VERSION}/${opts.wabaId}/phone_numbers?fields=id,display_phone_number&limit=100`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id: string; display_phone_number?: string }[]
    }
    for (const p of json.data ?? []) {
      const got = (p.display_phone_number ?? "").replace(/\D/g, "")
      if (got && (got === want || got.endsWith(want) || want.endsWith(got))) {
        return p.id
      }
    }
  } catch {
    // ignore — fall back to the original error
  }
  return null
}

/**
 * Trigger Meta to send the 6-digit code by SMS or voice. SMS by default
 * since it lands fastest. Voice is the retry path when SMS doesn't arrive
 * (common with Indonesian carriers).
 */
export async function requestVerificationCode(opts: {
  phoneNumberId: string
  method?: "SMS" | "VOICE"
  language?: string
}): Promise<ApiOk | ApiErr> {
  const token = getToken()
  if (!token) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN not set" }
  const url = `${GRAPH_BASE}/${API_VERSION}/${opts.phoneNumberId}/request_code`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code_method: opts.method || "SMS",
        language: opts.language || "en",
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean
      error?: { message?: string; code?: number; error_user_msg?: string }
    }
    if (!res.ok || json.success !== true) {
      return {
        ok: false,
        error:
          json.error?.error_user_msg ||
          json.error?.message ||
          `HTTP ${res.status}`,
        code: json.error?.code,
        raw: json,
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Submit the 6-digit code the admin received. */
export async function verifyCode(opts: {
  phoneNumberId: string
  code: string
}): Promise<ApiOk | ApiErr> {
  const token = getToken()
  if (!token) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN not set" }
  const url = `${GRAPH_BASE}/${API_VERSION}/${opts.phoneNumberId}/verify_code`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: opts.code }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean
      error?: { message?: string; code?: number; error_user_msg?: string }
    }
    if (!res.ok || json.success !== true) {
      return {
        ok: false,
        error:
          json.error?.error_user_msg ||
          json.error?.message ||
          `HTTP ${res.status}`,
        code: json.error?.code,
        raw: json,
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Finalize the phone for messaging. Meta requires this step + a 6-digit
 * 2FA PIN that's stored against the phone (used for re-registers if the
 * number is ever migrated). We generate the PIN per studio and persist it.
 */
export async function registerPhone(opts: {
  phoneNumberId: string
  pin: string
}): Promise<ApiOk | ApiErr> {
  const token = getToken()
  if (!token) return { ok: false, error: "WHATSAPP_ACCESS_TOKEN not set" }
  const url = `${GRAPH_BASE}/${API_VERSION}/${opts.phoneNumberId}/register`

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        pin: opts.pin,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean
      error?: { message?: string; code?: number; error_user_msg?: string }
    }
    if (!res.ok || json.success !== true) {
      return {
        ok: false,
        error:
          json.error?.error_user_msg ||
          json.error?.message ||
          `HTTP ${res.status}`,
        code: json.error?.code,
        raw: json,
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Get the default WABA the studios attach to. */
export function getDefaultWabaId(): string {
  return DEFAULT_WABA_ID
}
