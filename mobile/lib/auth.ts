import { create } from "zustand"
import * as SecureStore from "expo-secure-store"
import { api, clearTokens, setTokens, setAuthFailureHandler } from "@/lib/api"
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
        const user = JSON.parse(cached) as AuthUser
        set({ user, bootstrapped: true })
        // Re-register the push token on every cold start so token rotations
        // (Expo can rotate, user toggled permissions, OS reinstall) propagate.
        registerPushToken().catch(() => {})
        // The cached user is only a snapshot from the last sign-in; the role
        // can change server-side (a coach demoted from admin kept landing on
        // the admin surface forever, 08.07). Revalidate in the background and
        // let the router re-route if anything changed. api() transparently
        // refreshes an expired access token; a dead session triggers the
        // auth-failure handler below instead.
        api<{ user: AuthUser }>("/api/auth/native/me")
          .then(async ({ user: fresh }) => {
            if (!fresh?.role) return
            await SecureStore.setItemAsync(USER_KEY, JSON.stringify(fresh))
            set({ user: fresh })
          })
          .catch(() => { /* offline - keep the cached snapshot */ })
        return
      }
    } catch {
      /* fall through */
    }
    set({ user: null, bootstrapped: true })
  },
}))

// A 401 that survived a token refresh = the session is dead for good. Clear
// the local session so the root router sends the person to the login screen -
// without this, a stale-cached role could trap them on a surface where every
// request 401s and no sign-out button is reachable (Andrey's case, 08.07).
setAuthFailureHandler(() => {
  clearTokens().catch(() => {})
  SecureStore.deleteItemAsync(USER_KEY).catch(() => {})
  useAuth.setState({ user: null, bootstrapped: true })
})

// Helper for screens that need to decide where to land after auth resolves.
export function homeRouteFor(role: UserRole | undefined): "/(auth)/login" | "/(client)" | "/(trainer)" | "/(admin)" {
  if (role === "TRAINER") return "/(trainer)"
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "/(admin)"
  if (role === "CLIENT") return "/(client)"
  return "/(auth)/login"
}
