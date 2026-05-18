import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getStudioIdBySubdomain } from "@/lib/studio"

export const dynamic = "force-dynamic"

// Lightweight public info — used by the admin / trainer sidebars to label
// which studio is currently being managed. No auth required.
export async function GET() {
  try {
    const studioId = await getStudioIdBySubdomain()
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { id: true, name: true, slug: true, isDefault: true },
    })
    if (!studio) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(studio)
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}
