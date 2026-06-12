import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { signAccessToken, signRefreshToken } from "@/lib/native-jwt"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { rateLimit, clientIp } from "@/lib/rate-limit"

const Body = z.object({
  email: z.string().email().or(z.string().min(2)),
  password: z.string().min(1),
})

// POST /api/auth/native/login
// Issues an access + refresh token for a phone client. Unlike the web
// Credentials flow, we DO NOT scope by subdomain — the mobile app doesn't
// have a host-based tenant, the user's own studioId is the boundary. The
// app reads role from the response and routes accordingly (client vs
// trainer surface).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = Body.parse(body)

    // Brute-force brake (audit 2026-06-12).
    const rl = await rateLimit({
      scope: "login",
      subject: `${clientIp(request)}:${(data.email || "").toLowerCase()}`,
      limit: 10,
      windowSec: 900,
    })
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many attempts — try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { studio: { select: { slug: true } } },
    })
    if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })

    const ok = await bcrypt.compare(data.password, user.password)
    if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })

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
