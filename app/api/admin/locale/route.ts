// GET/PATCH /api/admin/locale - the signed-in admin's UI language.
// Per-user by design (owner 15.07): each admin flips it for themselves only.
// "uk" = Ukrainian admin panel; anything else / null = English (default).
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { locale: true },
  })
  return NextResponse.json({ locale: user?.locale === "uk" ? "uk" : "en" })
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { locale?: string }
  const locale = body.locale === "uk" ? "uk" : null // null = English default
  await prisma.user.update({ where: { id: ctx.userId }, data: { locale } })
  return NextResponse.json({ locale: locale ?? "en" })
}
