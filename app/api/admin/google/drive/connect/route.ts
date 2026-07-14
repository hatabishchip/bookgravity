// GET /api/admin/google/drive/connect
// Starts the owner's Google Drive OAuth (media bridge). SUPER_ADMIN only - it's
// one owner account for the whole product, not per-studio.
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { driveConfigured, driveAuthUrl } from "@/lib/google-drive"

export const dynamic = "force-dynamic"

export async function GET() {
  const base = process.env.NEXTAUTH_URL || "https://bookgravity.com"
  const ctx = await requireAdmin()
  if (!ctx || ctx.role !== "SUPER_ADMIN") return NextResponse.redirect(new URL("/login", base))
  if (!driveConfigured()) return NextResponse.redirect(new URL("/admin/settings?drive=unavailable", base))
  return NextResponse.redirect(driveAuthUrl(ctx.userId))
}
