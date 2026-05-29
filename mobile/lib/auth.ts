import { create } from "zustand"
import * as SecureStore from "expo-secure-store"
import { api, clearTokens, setTokens } from "@/lib/api"
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
    return res.user
  },

  async signOut() {
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
        return
      }
    } catch {
      /* fall through */
    }
    set({ user: null, bootstrapped: true })
  },
}))

// Helper for screens that need to decide where to land after auth resolves.
export function homeRouteFor(role: UserRole | undefined): "/(auth)/login" | "/(client)" | "/(trainer)" {
  if (role === "TRAINER") return "/(trainer)"
  if (role === "ADMIN" || role === "SUPER_ADMIN" || role === "CLIENT") return "/(client)"
  return "/(auth)/login"
}
