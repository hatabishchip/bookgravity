// GET/PATCH /api/admin/locale - the signed-in admin's UI language.
// Per-user by design (owner 15.07): each admin flips it for themselves only.
// "uk" = Ukrainian admin panel; "en" = English. When the admin has NOT chosen
// yet (locale null) the studio default applies (e.g. studio "solar" = uk).
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { resolveAdminLocale } from "@/lib/i18n"

export const dynamic = "force-dynamic"

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { locale: true, studio: { select: { slug: true } } },
  })
  return NextResponse.json({ locale: resolveAdminLocale(user?.locale, user?.studio?.slug) })
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
