import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// Web sessions older than this are treated as expired and not shown (and get
// cleaned up lazily on read). Mirrors a typical JWT session lifetime.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

// GET /api/admin/sessions
// Returns, for every admin & trainer in the caller's studio, their active
// sign-ins: web browser sessions (LoginSession) + mobile app devices
// (NativePushToken). Lets the admin see who is logged in where.
export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cutoff = new Date(Date.now() - SESSION_TTL_MS)

  // Drop stale web sessions so the list stays meaningful.
  await prisma.loginSession.deleteMany({
    where: { lastSeenAt: { lt: cutoff }, user: { studioId: ctx.studioId } },
  }).catch(() => {})

  const users = await prisma.user.findMany({
    where: { studioId: ctx.studioId, role: { in: ["ADMIN", "SUPER_ADMIN", "TRAINER"] } },
    select: {
      id: true,
      email: true,
      role: true,
      trainer: { select: { name: true } },
      loginSessions: {
        orderBy: { lastSeenAt: "desc" },
        select: { id: true, device: true, lastSeenAt: true, createdAt: true },
      },
      pushTokens: {
        orderBy: { lastSeenAt: "desc" },
        select: { id: true, deviceName: true, platform: true, lastSeenAt: true },
      },
    },
    orderBy: { role: "asc" },
  })

  const result = users.map((u) => ({
    userId: u.id,
    email: u.email,
    role: u.role,
    name: u.trainer?.name ?? null,
    web: u.loginSessions.map((s) => ({
      id: s.id,
      device: s.device,
      lastSeenAt: s.lastSeenAt,
    })),
    mobile: u.pushTokens.map((t) => ({
      id: t.id,
      device: t.deviceName ?? `${t.platform} device`,
      platform: t.platform,
      lastSeenAt: t.lastSeenAt,
    })),
  }))

  return NextResponse.json(result)
}

// DELETE /api/admin/sessions?kind=web|mobile&id=<id>
// Removes a single sign-in record. Web: deletes the LoginSession row (clears it
// from the list). Mobile: deletes the NativePushToken (the device also stops
// receiving notifications). Scoped to the admin's own studio.
export async function DELETE(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const kind = searchParams.get("kind")
  const id = searchParams.get("id")
  if (!id || (kind !== "web" && kind !== "mobile")) {
    return NextResponse.json({ error: "kind (web|mobile) and id are required" }, { status: 400 })
  }

  if (kind === "web") {
    // Only allow deleting a session that belongs to a user in this studio.
    const session = await prisma.loginSession.findUnique({
      where: { id },
      select: { user: { select: { studioId: true } } },
    })
    if (!session || session.user.studioId !== ctx.studioId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    await prisma.loginSession.delete({ where: { id } })
  } else {
    const token = await prisma.nativePushToken.findUnique({
      where: { id },
      select: { user: { select: { studioId: true } } },
    })
    if (!token || token.user.studioId !== ctx.studioId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    await prisma.nativePushToken.delete({ where: { id } })
  }

  return NextResponse.json({ ok: true })
}
