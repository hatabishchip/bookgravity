// GET /api/admin/google/calendar/callback?code=...&state=<studioId>
// Google redirects here after consent. We exchange the code for a refresh
// token and store it on the LOGGED-IN admin's studio (state must match the
// session's studio — defence against cross-studio binding).
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { exchangeCode, getUserEmail } from "@/lib/google-calendar"

export const dynamic = "force-dynamic"

function settingsRedirect(status: string) {
  const base = process.env.NEXTAUTH_URL || "https://bookgravity.com"
  return NextResponse.redirect(new URL(`/admin/settings?gcal=${status}`, base))
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL || "https://bookgravity.com"))

  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  if (searchParams.get("error") || !code) return settingsRedirect("error")
  // The OAuth flow was started for THIS admin's studio.
  if (state && state !== ctx.studioId) return settingsRedirect("error")

  const tok = await exchangeCode(code)
  if (!tok.ok || !tok.refreshToken) {
    // No refresh token (e.g. user previously consented and Google didn't
    // re-issue one) — ask them to disconnect in Google and retry.
    return settingsRedirect("noretoken")
  }
  const email = await getUserEmail(tok.accessToken)

  await prisma.studio.update({
    where: { id: ctx.studioId },
    data: {
      googleRefreshToken: tok.refreshToken,
      googleEmail: email,
      googleCalendarId: "primary",
      googleConnectedAt: new Date(),
    },
  })
  return settingsRedirect("connected")
}
