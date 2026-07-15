// Google Drive media bridge (owner 14.07).
//
// Trainers attach photos/videos in the WhatsApp inbox; instead of pushing the
// file THROUGH WhatsApp (which compresses and mixes everyone's media), we upload
// the ORIGINAL to the owner's personal Drive, into a per-client sub-folder, and
// send the client a LINK. Each client's sub-folder is shared view-only "anyone
// with the link", so a client only ever sees their own media (they only get
// their own folder's link), never the whole Drive.
//
// One owner account (hatabishchip@gmail.com) authorizes once; we keep the
// refresh token + the root folder id in env (GOOGLE_DRIVE_REFRESH_TOKEN,
// GOOGLE_DRIVE_ROOT_FOLDER_ID). Per-client folders are found/created by name at
// upload time, so there's no DB migration to carry.

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const DRIVE_API = "https://www.googleapis.com/drive/v3"
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
// drive.file = access ONLY to files this app creates. Non-sensitive scope, so
// Google needs no extra verification (unlike full `drive`).
const SCOPES = "https://www.googleapis.com/auth/drive.file email"

export function driveConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
}

export function driveConnected(): boolean {
  return !!process.env.GOOGLE_DRIVE_REFRESH_TOKEN
}

function baseUrl(): string {
  return (process.env.MAIL_PUBLIC_URL || process.env.NEXTAUTH_URL || "https://bookgravity.com").replace(/\/$/, "")
}

export function driveRedirectUri(): string {
  return `${baseUrl()}/api/admin/google/drive/callback`
}

/** Consent URL for connecting the owner's Drive. */
export function driveAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: driveRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })
  return `${AUTH_URL}?${p.toString()}`
}

type TokenResp = { access_token?: string; refresh_token?: string; error?: string; error_description?: string }

export async function driveExchangeCode(
  code: string,
): Promise<{ ok: true; refreshToken: string | null; accessToken: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: driveRedirectUri(),
        grant_type: "authorization_code",
      }),
    })
    const j = (await res.json().catch(() => ({}))) as TokenResp
    if (!res.ok || !j.access_token) return { ok: false, error: j.error_description || j.error || `HTTP ${res.status}` }
    return { ok: true, refreshToken: j.refresh_token ?? null, accessToken: j.access_token }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function accessToken(): Promise<string | null> {
  const refresh = process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  if (!refresh) return null
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refresh,
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

async function driveFetch(token: string, path: string, init?: RequestInit) {
  return fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  })
}

/** Drive query-string escape (single quotes must be doubled). */
function q(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

/** Find a folder by name under a parent, or create it. Returns its id. */
async function ensureFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const query = `mimeType='application/vnd.google-apps.folder' and name='${q(name)}' and '${q(parentId)}' in parents and trashed=false`
  const r = await driveFetch(token, `/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`)
  if (r.ok) {
    const j = (await r.json()) as { files?: { id: string }[] }
    if (j.files && j.files[0]) return j.files[0].id
  }
  const c = await driveFetch(token, `/files?fields=id`, {
    method: "POST",
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  })
  if (!c.ok) return null
  const cj = (await c.json()) as { id?: string }
  return cj.id ?? null
}

/** Make a file/folder readable by anyone with the link (idempotent-ish). */
async function shareAnyoneWithLink(token: string, fileId: string): Promise<void> {
  await driveFetch(token, `/files/${fileId}/permissions?fields=id`, {
    method: "POST",
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  }).catch(() => {})
}

export type DriveUploadResult = {
  fileId: string
  folderId: string
  /** Shareable link to the client's whole folder (they see all their media). */
  folderLink: string
  /** Direct link to this file. */
  fileLink: string
}

/**
 * Upload a media file to the client's sub-folder and return links.
 * clientKey = a stable, human folder name for the client (name + last digits).
 */
export async function uploadClientMedia(opts: {
  clientKey: string
  filename: string
  mimeType: string
  bytes: Buffer
}): Promise<{ ok: true; result: DriveUploadResult } | { ok: false; error: string }> {
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  if (!rootId) return { ok: false, error: "drive_root_not_set" }
  const token = await accessToken()
  if (!token) return { ok: false, error: "drive_not_connected" }

  const folderId = await ensureFolder(token, opts.clientKey, rootId)
  if (!folderId) return { ok: false, error: "folder_failed" }
  // Share the client's folder view-only so the client sees only their own media.
  await shareAnyoneWithLink(token, folderId)

  // Resumable upload keeps the ORIGINAL bytes (no compression).
  const start = await fetch(`${DRIVE_UPLOAD}?uploadType=resumable&fields=id,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mimeType,
      "X-Upload-Content-Length": String(opts.bytes.length),
    },
    body: JSON.stringify({ name: opts.filename, parents: [folderId] }),
  })
  if (!start.ok || !start.headers.get("location")) {
    return { ok: false, error: `upload_init_${start.status}` }
  }
  const uploadUrl = start.headers.get("location")!
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": opts.mimeType, "Content-Length": String(opts.bytes.length) },
    body: new Uint8Array(opts.bytes),
  })
  if (!put.ok) return { ok: false, error: `upload_${put.status}` }
  const pj = (await put.json().catch(() => ({}))) as { id?: string; webViewLink?: string }
  if (!pj.id) return { ok: false, error: "upload_no_id" }

  return {
    ok: true,
    result: {
      fileId: pj.id,
      folderId,
      folderLink: `https://drive.google.com/drive/folders/${folderId}`,
      fileLink: pj.webViewLink || `https://drive.google.com/file/d/${pj.id}/view`,
    },
  }
}

/** Create (or find) the root "Gravity Stretching Media" folder; returns its id. */
export async function ensureRootFolder(): Promise<string | null> {
  const token = await accessToken()
  if (!token) return null
  // Root lives at Drive root ("root" is the reserved parent alias).
  return ensureFolder(token, "Gravity Stretching Media", "root")
}

/** Same, but with a caller-supplied access token — used by the OAuth callback,
 *  which holds a fresh token BEFORE GOOGLE_DRIVE_REFRESH_TOKEN lands in env.
 *  Lets one consent round-trip produce both env values at once. */
export async function ensureRootFolderWithToken(token: string): Promise<string | null> {
  return ensureFolder(token, "Gravity Stretching Media", "root")
}
