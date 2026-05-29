import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/native-jwt"

// GET /api/auth/native/me
// Returns the current user given an Authorization: Bearer header. Used by
// the mobile app to validate cached credentials on cold start.
export async function GET(request: NextRequest) {
  const header = request.headers.get("authorization") ?? ""
  const match = /^Bearer (.+)$/.exec(header)
  if (!match) return NextResponse.json({ error: "Missing token" }, { status: 401 })
  const payload = verifyToken(match[1])
  if (!payload || payload.type !== "access") {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { studio: { select: { slug: true } } },
  })
  if (!user) return NextResponse.json({ error: "User no longer exists" }, { status: 401 })
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      studioId: user.studioId,
      studioSlug: user.studio.slug,
    },
  })
}
