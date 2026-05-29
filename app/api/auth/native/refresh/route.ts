import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { signAccessToken, signRefreshToken, verifyToken } from "@/lib/native-jwt"
import { z } from "zod"

const Body = z.object({ refreshToken: z.string().min(10) })

// POST /api/auth/native/refresh
// Rotates a refresh token: caller hands us their long-lived refresh, we
// reissue a fresh access + a new refresh. Old refresh remains usable until
// expiry; revocation will come with a jti blocklist when we add it.
export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = Body.parse(await request.json())
    const payload = verifyToken(refreshToken)
    if (!payload || payload.type !== "refresh") {
      return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 })
    }

    // Re-read the user so the issued access reflects role / studio changes
    // (e.g., admin promoted to super-admin) without forcing a full logout.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { studio: { select: { slug: true } } },
    })
    if (!user) return NextResponse.json({ error: "User no longer exists" }, { status: 401 })

    const tokenInput = {
      sub: user.id,
      role: user.role,
      studioId: user.studioId,
      studioSlug: user.studio.slug,
    }
    const access = signAccessToken(tokenInput)
    const refresh = signRefreshToken(tokenInput)
    return NextResponse.json({
      token: access.token,
      refreshToken: refresh.token,
      expiresAt: access.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        studioId: user.studioId,
        studioSlug: user.studio.slug,
      },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
