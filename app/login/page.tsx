"use client"

import { useState, useEffect } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/app/_components/ui/Button"
import { Input } from "@/app/_components/ui/Input"
import { Card } from "@/app/_components/ui/Card"
import { Alert } from "@/app/_components/ui/Alert"

// Social buttons appear only once their provider is fully wired (redirect URI
// registered in Google Cloud / Apple Services ID + key created). Build-time
// public flags let the code ship dormant and go live by flipping one env var,
// with no broken button in production meanwhile. The server still guards each
// flow by the presence of its real credentials.
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1"
const APPLE_ENABLED = process.env.NEXT_PUBLIC_APPLE_LOGIN === "1"
const ANY_SOCIAL = GOOGLE_ENABLED || APPLE_ENABLED

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [social, setSocial] = useState<"google" | "apple" | null>(null)
  // Already signed in? Bounce straight to the dashboard so staff coming from
  // the booking page never have to re-enter their credentials.
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  // Surface a social-login refusal (unknown email = not staff) sent back as
  // ?error= by the signIn callback.
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error")
    if (err === "NotStaff") setError("This Google/Apple account isn't linked to a staff member. Use the email and password you were given, or ask the admin to add your email.")
    else if (err === "NoEmail") setError("Couldn't read an email from that account. Please sign in with your email and password.")
    else if (err === "OAuthAccountNotLinked") setError("That email already signs in a different way. Use your email and password.")
    else if (err) setError("Sign-in failed. Please try again, or use your email and password.")
  }, [])

  const handleSocial = (provider: "google" | "apple") => {
    if (social) return
    setSocial(provider)
    setError("")
    // Google forbids OAuth inside an embedded WebView ("disallowed_useragent").
    // In the native app, hand the Google flow to the shell, which runs the whole
    // thing in the system browser and bridges the session back via a deep link
    // (see /native-return). Apple uses form_post and works in-WebView, so it
    // stays on the normal path.
    const w = window as unknown as { __GS_NATIVE__?: boolean; ReactNativeWebView?: { postMessage: (d: string) => void } }
    if (provider === "google" && w.__GS_NATIVE__ && w.ReactNativeWebView) {
      w.ReactNativeWebView.postMessage(JSON.stringify({ type: "social-login", provider: "google" }))
      // The shell drives it from here; drop the spinner shortly so the button is
      // usable again if the user dismisses the system browser.
      setTimeout(() => setSocial(null), 2000)
      return
    }
    // Full-page redirect through the provider; on return the session cookie is
    // set and the /login mount effect above bounces to the right dashboard.
    signIn(provider, { callbackUrl: "/login" })
  }

  // Native Google bridge (system-browser side): the shell opens
  // /login?social=google&nr=1 in the system browser. Run the full Google OAuth
  // HERE (the pkce cookie lives in this browser), then land on /native-return,
  // which mints a native token pair and deep-links it back into the app.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get("social") === "google" && sp.get("nr") === "1") {
      signIn("google", { callbackUrl: "/native-return" })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // On the native-bridge tab (?nr=1) we never auto-redirect to a dashboard -
    // the whole point is to run OAuth and hand a token back to the app.
    if (new URLSearchParams(window.location.search).get("nr") === "1") {
      setChecking(false)
      return
    }
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

        <Card className="p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="login-email"
              name="email"
              label="Email or username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              id="login-password"
              name="password"
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <Alert>{error}</Alert>}

            <Button type="submit" disabled={loading} fullWidth>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <div className="text-center">
              <Link href="/auth/forgot-password" className="text-sm text-gray-400 hover:text-brand">
                Forgot password?
              </Link>
            </div>
          </form>

          {/* Social sign-in - an alternative to the password for staff whose
              email is already in the system. Each button appears only when its
              provider is configured (build-time flag). */}
          {ANY_SOCIAL && (
          <>
          <div className="mt-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="mt-4 space-y-2.5">
            {GOOGLE_ENABLED && (
            <button
              type="button"
              onClick={() => handleSocial("google")}
              disabled={!!social}
              className="w-full flex items-center justify-center gap-2.5 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 active:scale-[0.99] transition disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
              </svg>
              {social === "google" ? "Opening Google..." : "Continue with Google"}
            </button>
            )}
            {APPLE_ENABLED && (
              <button
                type="button"
                onClick={() => handleSocial("apple")}
                disabled={!!social}
                className="w-full flex items-center justify-center gap-2.5 border border-gray-900 rounded-lg py-2.5 text-sm font-medium text-white bg-black hover:bg-gray-900 active:scale-[0.99] transition disabled:opacity-60"
              >
                <svg width="16" height="16" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                </svg>
                {social === "apple" ? "Opening Apple..." : "Continue with Apple"}
              </button>
            )}
          </div>
          </>
          )}
        </Card>
      </div>
    </div>
  )
}
