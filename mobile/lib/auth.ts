import { create } from "zustand"
import * as SecureStore from "expo-secure-store"
import { api, ApiError, clearTokens, setTokens, setAuthFailureHandler } from "@/lib/api"
import { registerPushToken, deregisterPushToken } from "@/lib/push"
import type { NativeLoginResponse, UserRole } from "@shared/types"

// Cached user payload mirrors what the server returns on /native/login so
// the role router can read it synchronously after rehydration.
const USER_KEY = "gs.auth.user"

export type AuthUser = NativeLoginResponse["user"]

type AuthState = {
  user: AuthUser | null
  bootstrapped: boolean
  signIn: (email: string, password: string) => Promise<AuthUser>
  /** The app is the mobile web 1:1 (09.07): people sign in with the WEB form
   *  inside the WebView, and the page hands us a native token pair via
   *  postMessage so push notifications work. This adopts that session. */
  adoptWebLogin: (payload: { token: string; refreshToken: string; user: AuthUser }) => Promise<void>
  signOut: () => Promise<void>
  hydrate: () => Promise<void>
}

// Zustand store — global mutable singleton replaces React context. Avoids
// re-renders for components that don't care about auth state and lets the
// router subscribe ergonomically with a selector.
export const useAuth = create<AuthState>((set) => ({
  user: null,
  bootstrapped: false,

  async signIn(email, password) {
    const res = await api<NativeLoginResponse>("/api/auth/native/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    })
    await setTokens(res.token, res.refreshToken)
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(res.user))
    set({ user: res.user, bootstrapped: true })
    // Fire-and-forget: register this device for push so the trainer/admin
    // sees booking notifications. Awaiting here would block the redirect.
    registerPushToken().catch(() => {})
    return res.user
  },

  async adoptWebLogin({ token, refreshToken, user }) {
    if (!token || !refreshToken || !user?.id) return
    await setTokens(token, refreshToken)
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))
    set({ user, bootstrapped: true })
    registerPushToken().catch(() => {})
  },

  async signOut() {
    // Drop the device's push token first so the server stops sending to it.
    // Best-effort: a network failure here shouldn't block sign-out.
    await deregisterPushToken().catch(() => {})
    await clearTokens()
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => {})
    set({ user: null, bootstrapped: true })
  },

  async hydrate() {
    try {
      const cached = await SecureStore.getItemAsync(USER_KEY)
      if (cached) {
        const cachedUser = JSON.parse(cached) as AuthUser
        // Re-register the push token on every cold start so token rotations
        // (Expo can rotate, user toggled permissions, OS reinstall) propagate.
        registerPushToken().catch(() => {})

        // SESSION-REPAIR GATE (owner metaprompt 09.07: "opened once and it
        // works"). The cached user is only a sign-in snapshot; routing by it
        // put a coach whose role had changed onto the admin WebView where
        // every request 401s. So BEFORE the router picks a surface, ask the
        // server who this user is now and route by THAT. api() transparently
        // rotates an expired access token; only a dead session 401s through.
        // The splash screen stays up while we wait (root layout hides it on
        // bootstrapped), capped at 2.5s so a slow network never blocks launch.
        const gate = api<{ user: AuthUser }>("/api/auth/native/me")
        const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2500))
        try {
          const result = await Promise.race([gate, timeout])
          if (result !== "timeout" && result?.user?.role) {
            await SecureStore.setItemAsync(USER_KEY, JSON.stringify(result.user))
            set({ user: result.user, bootstrapped: true })
            return
          }
          // Slow network: launch on the cached snapshot now and let the
          // in-flight /me finish the repair in the background (the router
          // evicts from a wrong surface when the fresh role lands).
          set({ user: cachedUser, bootstrapped: true })
          gate
            .then(async ({ user: fresh }) => {
              if (!fresh?.role) return
              await SecureStore.setItemAsync(USER_KEY, JSON.stringify(fresh))
              set({ user: fresh })
            })
            .catch(() => { /* 401 → auth-failure handler signed us out; else offline */ })
          return
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            // Dead session (refresh failed too) - the auth-failure handler
            // already wiped tokens and user; land on the login screen.
            set({ user: null, bootstrapped: true })
            return
          }
          // Offline / 5xx: NEVER sign out on infrastructure errors - keep the
          // cached session and retry the revalidation shortly.
          set({ user: cachedUser, bootstrapped: true })
          scheduleRevalidate()
          return
        }
      }
    } catch {
      /* fall through */
    }
    set({ user: null, bootstrapped: true })
  },
}))

// Re-fetch the canonical user and re-persist it; used by the offline retry
// path of the session-repair gate above.
async function revalidateUser(): Promise<void> {
  const { user: fresh } = await api<{ user: AuthUser }>("/api/auth/native/me")
  if (!fresh?.role) return
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(fresh))
  useAuth.setState({ user: fresh })
}

function scheduleRevalidate(delays: number[] = [15_000, 60_000]) {
  const [next, ...rest] = delays
  if (next == null) return
  setTimeout(() => {
    revalidateUser().catch((err) => {
      // A definitive 401 already signed us out via the auth-failure handler;
      // anything else (still offline) just tries again later.
      if (err instanceof ApiError && err.status === 401) return
      scheduleRevalidate(rest)
    })
  }, next)
}

// A 401 that survived a token refresh = the session is dead for good. Clear
// the local session so the root router sends the person to the login screen -
// without this, a stale-cached role could trap them on a surface where every
// request 401s and no sign-out button is reachable (Andrey's case, 08.07).
setAuthFailureHandler(() => {
  clearTokens().catch(() => {})
  SecureStore.deleteItemAsync(USER_KEY).catch(() => {})
  useAuth.setState({ user: null, bootstrapped: true })
})

// The app is one WebView; this maps a role to its WEB home path (used as the
// bridge `next` target). Guests and clients live on the public site.
export function webHomeFor(role: UserRole | undefined): string {
  if (role === "TRAINER") return "/trainer"
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "/admin"
  return "/"
}
