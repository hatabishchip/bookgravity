import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

// Save (or refresh) a browser's Web Push subscription for the signed-in user.
// Any authenticated cabinet user (admin / trainer / staff / super-admin) can
// subscribe so their phone rings on new client messages.
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const sub = body?.subscription
  const endpoint: string | undefined = sub?.endpoint
  const p256dh: string | undefined = sub?.keys?.p256dh
  const auth_: string | undefined = sub?.keys?.auth
  if (!endpoint || !p256dh || !auth_) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
  }

  // Upsert by endpoint (a browser re-subscribing keeps one row, re-pointed at
  // the current user).
  await prisma.webPushSubscription.upsert({
    where: { endpoint },
    create: { userId: session.user.id, endpoint, p256dh, auth: auth_ },
    update: { userId: session.user.id, p256dh, auth: auth_ },
  })
  return NextResponse.json({ ok: true })
}

// Remove this browser's subscription (used when the user turns notifications off
// or the subscription changes).
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const endpoint = new URL(req.url).searchParams.get("endpoint")
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 })
  await prisma.webPushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } })
  return NextResponse.json({ ok: true })
}
