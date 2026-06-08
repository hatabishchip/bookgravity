// POST /api/sadmin/impersonate  { studioId }
// SUPER_ADMIN only. Mints a short-lived token to sign in AS the studio's admin
// — but ONLY while that admin still uses the auto-generated starter password
// (initialPassword set). Once they set their own password, impersonation is
// refused (and the super-admin UI hides the button).
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { signImpersonationToken } from "@/lib/impersonate"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { studioId } = (await req.json().catch(() => ({}))) as { studioId?: string }
  if (!studioId) return NextResponse.json({ error: "studioId required" }, { status: 400 })

  const admin = await prisma.user.findFirst({
    where: { studioId, role: "ADMIN" },
    select: { id: true, initialPassword: true },
    orderBy: { id: "asc" },
  })
  if (!admin) return NextResponse.json({ error: "No admin for this studio" }, { status: 404 })
  // Guard: only while the starter password is unchanged.
  if (!admin.initialPassword) {
    return NextResponse.json(
      { error: "This admin already set their own password — impersonation is disabled." },
      { status: 409 },
    )
  }

  return NextResponse.json({ token: signImpersonationToken(admin.id) })
}
