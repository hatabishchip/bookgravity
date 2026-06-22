import { NextRequest, NextResponse } from "next/server"
import { hasExternalKey, studioBySlug, studioOccupancy } from "@/lib/external-api"

// GET /api/external/occupancy?studio=canggu&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns every busy window for the studio room (class slots + sublet blocks).
// Used by the studio-sublet service to know what is free. Auth: x-api-key.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!hasExternalKey(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const slug = searchParams.get("studio") ?? ""
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  if (!from || !to) return NextResponse.json({ error: "from and to are required (YYYY-MM-DD)" }, { status: 400 })

  const studio = await studioBySlug(slug)
  if (!studio) return NextResponse.json({ error: "Unknown studio" }, { status: 404 })

  const busy = await studioOccupancy(studio.id, from, to)
  return NextResponse.json({ studio: studio.slug, from, to, busy }, { headers: { "Cache-Control": "no-store" } })
}
