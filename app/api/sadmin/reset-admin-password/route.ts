import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

// The fixed value a studio admin's password is reset to, so the owner can
// always get back in. Kept simple on purpose ("случае чего сбросить").
const RESET_TO = "0400"

const Body = z.object({ studioId: z.string() })

// POST /api/sadmin/reset-admin-password
// Super-admin only. Resets the password of the studio's ADMIN account(s) to
// the fixed RESET_TO value. The platform SUPER_ADMIN account is deliberately
// NOT touched here — that master login is managed via Settings → Change
// password, not a one-click trivial reset.
export async function POST(request: NextRequest) {
  const ctx = await requireSuperAdmin()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let data: z.infer<typeof Body>
  try {
    data = Body.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "studioId required" }, { status: 400 })
  }

  const admins = await prisma.user.findMany({
    where: { studioId: data.studioId, role: "ADMIN" },
    select: { id: true, email: true },
  })
  if (admins.length === 0) {
    return NextResponse.json(
      { error: "This studio has no separate admin account (managed by the super-admin)." },
      { status: 404 },
    )
  }

  const hash = await bcrypt.hash(RESET_TO, 10)
  await prisma.user.updateMany({
    where: { id: { in: admins.map((a) => a.id) } },
    data: { password: hash },
  })

  return NextResponse.json({
    ok: true,
    password: RESET_TO,
    emails: admins.map((a) => a.email),
  })
}
