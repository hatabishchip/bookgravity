import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/native-jwt"
import { z } from "zod"

const Body = z.object({
  chatNotifMode: z.enum(["SOUND_VIBRATION", "VIBRATION_ONLY", "SOUND_ONLY"]),
})

// GET /api/push/settings
// Returns the current user's notification preferences.
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
    select: { chatNotifMode: true },
  })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ chatNotifMode: user.chatNotifMode })
}

// PATCH /api/push/settings
// Update notification mode for the current user.
export async function PATCH(request: NextRequest) {
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

  await prisma.user.update({
    where: { id: payload.sub },
    data: { chatNotifMode: data.chatNotifMode },
  })

  return NextResponse.json({ ok: true })
}
