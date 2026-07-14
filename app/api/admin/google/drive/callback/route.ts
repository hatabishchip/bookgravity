// GET /api/admin/google/drive/callback?code=...
// Google redirects here after the owner consents to Drive access. We exchange
// the code for a refresh token and record it (owner's own token, owner's DB) so
// it can be pinned into GOOGLE_DRIVE_REFRESH_TOKEN once. SUPER_ADMIN only.
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { driveExchangeCode } from "@/lib/google-drive"
import { elog } from "@/lib/elog"

export const dynamic = "force-dynamic"

function red(status: string) {
  const base = process.env.NEXTAUTH_URL || "https://bookgravity.com"
  return NextResponse.redirect(new URL(`/admin/settings?drive=${status}`, base))
}

export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL || "https://bookgravity.com"
  const ctx = await requireAdmin()
  if (!ctx || ctx.role !== "SUPER_ADMIN") return NextResponse.redirect(new URL("/login", base))

  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  if (searchParams.get("error") || !code) return red("error")

  const tok = await driveExchangeCode(code)
  if (!tok.ok || !tok.refreshToken) return red("noretoken")

  // One-time capture: the refresh token gets pinned into the env
  // (GOOGLE_DRIVE_REFRESH_TOKEN) from here. It's the owner's own Drive token in
  // the owner's own DB; the log row is removed once the env is set.
  await elog("drive:connect", "drive authorized", { refreshToken: tok.refreshToken })
  return red("connected")
}
