// GET/PATCH /api/admin/locale - the signed-in admin's UI language.
// Per-user by design (owner 15.07): each admin flips it for themselves only.
// "uk" = Ukrainian admin panel; "en" = English. When the admin has NOT chosen
// yet (locale null) the studio default applies (e.g. studio "solar" = uk).
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { resolveAdminLocale } from "@/lib/admin-locale"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const ctx = await requireAdmin()
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const [user, studio] = await Promise.all([
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { locale: true } }),
      prisma.studio.findUnique({ where: { id: ctx.studioId }, select: { slug: true } }),
    ])
    return NextResponse.json({ locale: resolveAdminLocale(user?.locale, studio?.slug) })
  } catch (e) {
    return NextResponse.json({ __debug: (e as Error).message?.slice(0, 500), stack: (e as Error).stack?.slice(0, 400) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { locale?: string }
  // Store the explicit choice ("uk" or "en") so it always wins over the studio
  // default - a solar admin who picks English must stay in English.
  const locale = body.locale === "uk" ? "uk" : "en"
  await prisma.user.update({ where: { id: ctx.userId }, data: { locale } })
  return NextResponse.json({ locale })
}
