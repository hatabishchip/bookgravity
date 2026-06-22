import Constants from "expo-constants"
import * as SecureStore from "expo-secure-store"

// Cross-platform base URL for the bookgravity backend. Lives in app.json
// under expo.extra.apiBaseUrl so a single build can swap between prod and
// staging via EAS env variables.
export const API_BASE = ((Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl) ??
  "https://bookgravity.com"

// Token storage keys. SecureStore uses iOS Keychain / Android Keystore so
// the token is encrypted at rest and never lands in plain UserDefaults.
const TOKEN_KEY = "gs.auth.token"
const REFRESH_KEY = "gs.auth.refresh"

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function setTokens(token: string, refresh?: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh)
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {})
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {})
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message)
    this.name = "ApiError"
  }
}

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown
  // When false, skip the Authorization header even if a token is stored.
  // Used for unauth flows like /api/auth/native/login.
  auth?: boolean
}

// Single fetch wrapper used by every screen. Attaches the bearer token from
// SecureStore, parses JSON automatically, and throws ApiError on non-2xx so
// the caller can `.catch` cleanly.
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options
  const finalHeaders = new Headers(headers)
  if (!finalHeaders.has("Accept")) finalHeaders.set("Accept", "application/json")
  if (body !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json")
  }
  if (auth) {
    const token = await getToken()
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`
    throw new ApiError(res.status, data, message)
  }
  return data as T
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s) } catch { return s }
}
