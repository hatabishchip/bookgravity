import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const MAX_DATA_URL_LEN = 1_500_000 // ~1MB of base64 = ~750KB of real image

const StudioUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  logoUrl: z.string().max(MAX_DATA_URL_LEN).nullable().optional(),
  faviconUrl: z.string().max(MAX_DATA_URL_LEN).nullable().optional(),
  groupPrice: z.number().min(0).optional(),
  kidsPrice: z.number().min(0).optional(),
  privatePrice: z.number().min(0).optional(),
})

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { id: true, name: true, slug: true, logoUrl: true, faviconUrl: true, isDefault: true, groupPrice: true, kidsPrice: true, privatePrice: true },
  })
  if (!studio) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(studio)
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  const parsed = StudioUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 })
  }

  const studio = await prisma.studio.update({
    where: { id: ctx.studioId },
    data: parsed.data,
    select: { id: true, name: true, slug: true, logoUrl: true, faviconUrl: true, isDefault: true, groupPrice: true, kidsPrice: true, privatePrice: true },
  })
  return NextResponse.json(studio)
}
