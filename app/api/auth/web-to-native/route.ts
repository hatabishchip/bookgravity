import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { signAccessToken, signRefreshToken } from "@/lib/native-jwt"

// POST /api/auth/web-to-native
// The reverse of /native-bridge: the app IS the mobile web now, so people sign
// in with the web form inside the WebView - but push notifications need the
// NATIVE token pair. This mints one from the current web session (cookie) so
// the web page can hand it to the native shell via postMessage. Same response
// shape as /api/auth/native/login; only ever for the caller's own session.
export const dynamic = "force-dynamic"

export async function POST() {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    include: { studio: { select: { slug: true, logoUrl: true } } },
  })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const tokenInput = {
    sub: user.id,
    role: user.role,
    studioId: user.studioId,
    studioSlug: user.studio.slug,
  }
  const access = signAccessToken(tokenInput)
  const refresh = signRefreshToken(tokenInput)

  return NextResponse.json(
    {
      token: access.token,
      refreshToken: refresh.token,
      expiresAt: access.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        studioId: user.studioId,
        studioSlug: user.studio.slug,
        // Lightweight URL, not the base64 data URL - see /native/login.
        studioLogoUrl: user.studio.logoUrl ? `/api/logo?s=${user.studio.slug}` : null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
