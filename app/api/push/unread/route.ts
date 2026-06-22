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

  let count: number
  if (isAdmin) {
    count = await prisma.whatsAppConversation.count({
      where: { studioId: user.studioId, unreadAdmin: { gt: 0 } },
    })
  } else {
    const trainerId = user.trainer?.id
    if (!trainerId) return NextResponse.json({ unread: 0 })

    count = await prisma.whatsAppConversation.count({
      where: {
        studioId: user.studioId,
        unreadTrainer: { gt: 0 },
        OR: [
          { assignedTrainerId: trainerId },
          { access: { some: { trainerId } } },
        ],
      },
    })
  }

  return NextResponse.json({ unread: count })
}
