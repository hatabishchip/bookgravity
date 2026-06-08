// GET /api/admin/google/calendar/connect
// Starts the per-studio Google Calendar OAuth flow for the logged-in admin.
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { googleConfigured, authUrl } from "@/lib/google-calendar"

export const dynamic = "force-dynamic"

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL || "https://bookgravity.com"))
  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL("/admin/settings?gcal=unavailable", process.env.NEXTAUTH_URL || "https://bookgravity.com"),
    )
  }
  // state = the studio id; verified against the session on callback.
  return NextResponse.redirect(authUrl(ctx.studioId))
}
