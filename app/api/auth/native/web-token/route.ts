import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { signImpersonationToken } from "@/lib/impersonate"

// Bridge for the mobile app's admin WebView: an authenticated admin (native
// Bearer JWT) gets a short-lived token to sign the WebView into the SAME web
// session AS THEMSELVES. The app then loads /native-bridge?token=... which
// calls signIn and lands on /admin. Only mints for the caller's own user id,
// so there's no privilege escalation.
export const dynamic = "force-dynamic"

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const token = signImpersonationToken(ctx.userId)
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } })
}
