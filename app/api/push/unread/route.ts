import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/native-jwt"

// GET /api/push/unread
// Returns the total number of conversations with unread messages for the
// current user. Used by the mobile app to set the app icon badge count.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? ""
  const m = /^Bearer (.+)$/.exec(auth)
  if (!m) return NextResponse.json({ error: "Missing token" }, { status: 401 })
  const payload = verifyToken(m[1])
  if (!payload || payload.type !== "access") {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, studioId: true, role: true, trainer: { select: { id: true } } },
  })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN"

  // Return the unread conversation IDS too (not just the count): the app uses
  // them to dismiss tray notifications for chats that are no longer unread
  // (viewed by the admin / answered), so the Android icon number can never go
  // stale-high - launchers count tray items, not our programmatic badge.
  let ids: string[]
  if (isAdmin) {
    ids = (
      await prisma.whatsAppConversation.findMany({
        where: { studioId: user.studioId, unreadAdmin: { gt: 0 } },
        select: { id: true },
        take: 500,
      })
    ).map((c) => c.id)
  } else {
    const trainerId = user.trainer?.id
    if (!trainerId) return NextResponse.json({ unread: 0, conversationIds: [] })

    ids = (
      await prisma.whatsAppConversation.findMany({
        where: {
          studioId: user.studioId,
          unreadTrainer: { gt: 0 },
          OR: [
            { assignedTrainerId: trainerId },
            { access: { some: { trainerId } } },
          ],
        },
        select: { id: true },
        take: 500,
      })
    ).map((c) => c.id)
  }

  return NextResponse.json({ unread: ids.length, conversationIds: ids })
}
