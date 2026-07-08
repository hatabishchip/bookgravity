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

// Called when a 401 could not be repaired by a token refresh - the session is
// truly dead. auth.ts registers a handler that clears the cached user so the
// router sends the person to the native login instead of leaving them stuck
// on an endlessly-401ing screen. (api.ts must not import auth.ts - cycle.)
let onAuthFailure: (() => void) | null = null
export function setAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn
}

// Single-flight refresh: many screens fire requests in parallel, and when the
// access token expires they all 401 at once - rotate the token exactly once.
let refreshInFlight: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  try {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY)
    if (!refresh) return false
    const res = await fetch(`${API_BASE}/api/auth/native/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { token?: string; refreshToken?: string }
    if (!data?.token) return false
    await setTokens(data.token, data.refreshToken)
    return true
  } catch {
    return false
  }
}

function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshTokens().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown
  // When false, skip the Authorization header even if a token is stored.
  // Used for unauth flows like /api/auth/native/login.
  auth?: boolean
}

// Single fetch wrapper used by every screen. Attaches the bearer token from
// SecureStore, parses JSON automatically, and throws ApiError on non-2xx so
// the caller can `.catch` cleanly. On a 401 it rotates the access token via
// the stored refresh token (90d TTL) and retries the request once - so an
// expired access token never surfaces to a screen. Only when the refresh
// itself is dead does it give up and notify the auth-failure handler.
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options

  const doFetch = async (): Promise<Response> => {
    const finalHeaders = new Headers(headers)
    if (!finalHeaders.has("Accept")) finalHeaders.set("Accept", "application/json")
    if (body !== undefined && !finalHeaders.has("Content-Type")) {
      finalHeaders.set("Content-Type", "application/json")
    }
    if (auth) {
      const token = await getToken()
      if (token) finalHeaders.set("Authorization", `Bearer ${token}`)
    }
    return fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  let res = await doFetch()
  if (res.status === 401 && auth) {
    if (await tryRefresh()) {
      res = await doFetch()
    } else {
      onAuthFailure?.()
    }
  }

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
