import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/native-jwt"
import { z } from "zod"

const Body = z.object({
  expoPushToken: z.string().min(10),
  // Native FCM token (Android only) - lets the server deliver chat pushes via
  // FCM with a per-conversation collapse key. Optional: iOS and older installs
  // won't send it.
  fcmToken: z.string().min(10).optional(),
  platform: z.enum(["ios", "android", "web"]),
  deviceName: z.string().max(80).optional(),
})

// POST /api/native/push-token
// Mobile app calls this once after login, then every cold start. Upserts a
// (userId, expoPushToken) row so we know where to deliver pushes for this
// device. The same token re-registering just bumps lastSeenAt.
//
// DELETE /api/native/push-token
// Called on sign-out to stop delivering to a device the user no longer
// wants notifications on.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? ""
  const m = /^Bearer (.+)$/.exec(auth)
  if (!m) return NextResponse.json({ error: "Missing token" }, { status: 401 })
  const payload = verifyToken(m[1])
  if (!payload || payload.type !== "access") {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }

  let data: z.infer<typeof Body>
  try {
    data = Body.parse(await request.json())
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  await prisma.nativePushToken.upsert({
    where: { expoPushToken: data.expoPushToken },
    create: {
      userId: payload.sub,
      expoPushToken: data.expoPushToken,
      fcmToken: data.fcmToken ?? null,
      platform: data.platform,
      deviceName: data.deviceName,
    },
    update: {
      userId: payload.sub,
      fcmToken: data.fcmToken ?? null,
      platform: data.platform,
      deviceName: data.deviceName,
      lastSeenAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? ""
  const m = /^Bearer (.+)$/.exec(auth)
  if (!m) return NextResponse.json({ error: "Missing token" }, { status: 401 })
  const payload = verifyToken(m[1])
  if (!payload || payload.type !== "access") {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const expoPushToken = searchParams.get("expoPushToken")
  if (!expoPushToken) {
    // No specific device → drop every token for this user (full logout
    // from every install). Useful when the user revokes from a desktop.
    await prisma.nativePushToken.deleteMany({ where: { userId: payload.sub } })
  } else {
    await prisma.nativePushToken.deleteMany({
      where: { userId: payload.sub, expoPushToken },
    })
  }
  return NextResponse.json({ ok: true })
}
