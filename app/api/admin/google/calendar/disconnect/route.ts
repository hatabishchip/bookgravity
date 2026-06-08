// POST /api/admin/google/calendar/disconnect — unlink this studio's Google.
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function POST() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  await prisma.studio.update({
    where: { id: ctx.studioId },
    data: { googleRefreshToken: null, googleEmail: null, googleConnectedAt: null },
  })
  return NextResponse.json({ ok: true })
}
