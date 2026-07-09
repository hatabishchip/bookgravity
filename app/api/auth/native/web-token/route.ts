import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { signImpersonationToken } from "@/lib/impersonate"

// Bridge for the mobile app's WebViews (admin cabinet AND the trainer inbox):
// any authenticated staff user (native Bearer JWT) gets a short-lived token
// to sign the WebView into the SAME web session AS THEMSELVES. The app then
// loads /native-bridge?token=... which calls signIn and lands on their
// surface. Only mints for the caller's own user id, so there's no privilege
// escalation - the web pages enforce their own role checks (a trainer's
// session can't open /admin). Was requireAdmin() until 09.07, which 401'd
// every trainer's Messages tab.
export const dynamic = "force-dynamic"

export async function GET() {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const token = signImpersonationToken(ctx.userId)
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } })
}
