// Per-studio Google Calendar sync (one-way: BookGravity → Google).
//
// One platform-level OAuth app (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) lets
// each studio admin connect THEIR OWN Google account. The studio stores its
// own refresh token, so studios never mix. Everything no-ops cleanly until the
// env credentials are set.

import { prisma } from "@/lib/prisma"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars"
const SCOPES = "https://www.googleapis.com/auth/calendar.events email"

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
}

function baseUrl(): string {
  return (
    process.env.MAIL_PUBLIC_URL ||
    process.env.NEXTAUTH_URL ||
    "https://bookgravity.com"
  ).replace(/\/$/, "")
}

export function redirectUri(): string {
  return `${baseUrl()}/api/admin/google/calendar/callback`
}

/** Google consent URL. `state` carries the studio id (verified on callback). */
export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline", // get a refresh token
    prompt: "consent", // force refresh token even on re-connect
    include_granted_scopes: "true",
    state,
  })
  return `${AUTH_URL}?${p.toString()}`
}

type TokenResp = { access_token?: string; refresh_token?: string; error?: string; error_description?: string }

/** Exchange an auth code for tokens (includes a refresh_token on first consent). */
export async function exchangeCode(
  code: string,
): Promise<{ ok: true; accessToken: string; refreshToken: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    })
    const j = (await res.json().catch(() => ({}))) as TokenResp
    if (!res.ok || !j.access_token) return { ok: false, error: j.error_description || j.error || `HTTP ${res.status}` }
    return { ok: true, accessToken: j.access_token, refreshToken: j.refresh_token ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Trade a stored refresh token for a fresh short-lived access token. */
export async function accessTokenFromRefresh(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    })
    const j = (await res.json().catch(() => ({}))) as TokenResp
    return res.ok ? j.access_token ?? null : null
  } catch {
    return null
  }
}

export async function getUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
    const j = (await res.json().catch(() => ({}))) as { email?: string }
    return j.email ?? null
  } catch {
    return null
  }
}

// Country → IANA timezone for the event (the studios are in these regions).
function tzForCountry(country: string | null | undefined): string {
  switch ((country || "").toUpperCase()) {
    case "KZ": return "Asia/Almaty"
    case "RU": return "Europe/Moscow"
    case "UA": return "Europe/Kyiv"
    case "TH": return "Asia/Bangkok"
    case "ID":
    default: return "Asia/Makassar" // Bali (WITA)
  }
}

export type SlotForCal = {
  date: string        // YYYY-MM-DD
  startTime: string   // HH:mm
  endTime: string     // HH:mm
  classType: string
}

function eventBody(slot: SlotForCal, studioName: string, country: string | null | undefined) {
  const tz = tzForCountry(country)
  const label = slot.classType === "PRIVATE" ? "Private" : slot.classType === "KIDS" ? "Kids" : "Group"
  return {
    summary: `${label} class · ${studioName}`,
    description: "Synced from BookGravity.",
    start: { dateTime: `${slot.date}T${slot.startTime}:00`, timeZone: tz },
    end: { dateTime: `${slot.date}T${slot.endTime}:00`, timeZone: tz },
  }
}

/** Create or update the calendar event for a slot. Returns the event id (to
 *  store on the slot), or null on failure / not connected. */
export async function upsertSlotEvent(opts: {
  refreshToken: string | null
  calendarId: string | null
  studioName: string
  country: string | null
  slot: SlotForCal
  existingEventId: string | null
}): Promise<string | null> {
  if (!googleConfigured() || !opts.refreshToken) return null
  const accessToken = await accessTokenFromRefresh(opts.refreshToken)
  if (!accessToken) return null
  const cal = encodeURIComponent(opts.calendarId || "primary")
  const body = eventBody(opts.slot, opts.studioName, opts.country)
  try {
    const url = opts.existingEventId
      ? `${CAL_BASE}/${cal}/events/${encodeURIComponent(opts.existingEventId)}`
      : `${CAL_BASE}/${cal}/events`
    const res = await fetch(url, {
      method: opts.existingEventId ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      // A stale event id (deleted in Google) → create a fresh one.
      if (opts.existingEventId && (res.status === 404 || res.status === 410)) {
        return upsertSlotEvent({ ...opts, existingEventId: null })
      }
      console.warn("[gcal] upsert failed:", res.status, await res.text().catch(() => ""))
      return null
    }
    const j = (await res.json().catch(() => ({}))) as { id?: string }
    return j.id ?? opts.existingEventId ?? null
  } catch (e) {
    console.warn("[gcal] upsert threw:", e)
    return null
  }
}

/** Delete a slot's calendar event. Best-effort. */
export async function deleteSlotEvent(opts: {
  refreshToken: string | null
  calendarId: string | null
  eventId: string | null
}): Promise<void> {
  if (!googleConfigured() || !opts.refreshToken || !opts.eventId) return
  const accessToken = await accessTokenFromRefresh(opts.refreshToken)
  if (!accessToken) return
  const cal = encodeURIComponent(opts.calendarId || "primary")
  try {
    await fetch(`${CAL_BASE}/${cal}/events/${encodeURIComponent(opts.eventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (e) {
    console.warn("[gcal] delete threw:", e)
  }
}

// ---- prisma-aware convenience wrappers used by the slot CRUD endpoints ----
// All no-op instantly when Google isn't configured or the studio isn't
// connected, so they're safe to call on every slot change.

/** Create/update the Google event for a slot and persist its event id. */
export async function syncSlotToGoogle(slotId: string): Promise<void> {
  if (!googleConfigured()) return
  const slot = await prisma.timeSlot.findUnique({
    where: { id: slotId },
    select: {
      date: true, startTime: true, endTime: true, classType: true, googleEventId: true,
      studio: { select: { name: true, country: true, googleRefreshToken: true, googleCalendarId: true } },
    },
  })
  if (!slot || !slot.studio.googleRefreshToken) return
  const eventId = await upsertSlotEvent({
    refreshToken: slot.studio.googleRefreshToken,
    calendarId: slot.studio.googleCalendarId,
    studioName: slot.studio.name,
    country: slot.studio.country,
    slot,
    existingEventId: slot.googleEventId,
  })
  if (eventId && eventId !== slot.googleEventId) {
    await prisma.timeSlot.update({ where: { id: slotId }, data: { googleEventId: eventId } }).catch(() => {})
  }
}

/** Delete a slot's Google event — call BEFORE the slot row is removed. */
export async function unsyncSlotFromGoogle(slotId: string): Promise<void> {
  if (!googleConfigured()) return
  const slot = await prisma.timeSlot.findUnique({
    where: { id: slotId },
    select: { googleEventId: true, studio: { select: { googleRefreshToken: true, googleCalendarId: true } } },
  })
  if (!slot?.googleEventId || !slot.studio.googleRefreshToken) return
  await deleteSlotEvent({
    refreshToken: slot.studio.googleRefreshToken,
    calendarId: slot.studio.googleCalendarId,
    eventId: slot.googleEventId,
  })
}
