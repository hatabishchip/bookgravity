"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  // Already signed in? Bounce straight to the dashboard so staff coming from
  // the booking page never have to re-enter their credentials.
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((s) => {
        if (cancelled) return
        const role = s?.user?.role
        if (role === "ADMIN" || role === "SUPER_ADMIN") router.replace("/admin")
        else if (role === "TRAINER") router.replace("/trainer")
        else if (role === "STAFF") router.replace("/staff")
        else setChecking(false)
      })
      .catch(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError("")
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError("Invalid email or password")
        return
      }

      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" })
      const session = await sessionRes.json()
      const role = session?.user?.role

      // SUPER_ADMIN is also an admin of their home studio (Canggu in our case),
      // so a fresh login lands on the per-studio admin dashboard. The dedicated
      // /sadmin panel is reachable by typing the URL — not auto-redirected to.
      if (role === "ADMIN" || role === "SUPER_ADMIN") {
        router.push("/admin")
      } else if (role === "TRAINER") {
        router.push("/trainer")
      } else if (role === "STAFF") {
        router.push("/staff")
      } else {
        router.push("/")
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Try again.")
    } finally {
      // Always clear the button's "Signing in…" state even on success — the
      // router.push is fire-and-forget and if navigation stalls (cold cache,
      // network blip) the button would otherwise stay greyed out forever.
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="h-[100svh] bg-sand flex items-center justify-center px-4">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    )
  }

  return (
    <div className="h-[100svh] bg-sand flex items-center justify-center px-4 overflow-hidden">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-brand">Gravity Stretching</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email or username</label>
              <input
                id="login-email"
                name="email"
                type="text"
                required
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <div className="text-center">
              <Link href="/auth/forgot-password" className="text-sm text-gray-400 hover:text-brand">
                Forgot password?
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
