import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getStudioIdBySubdomain } from "@/lib/studio"
import { readFile } from "fs/promises"
import path from "path"

export const dynamic = "force-dynamic"

function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const m = /^data:([^;,]+)(;base64)?,(.+)$/.exec(dataUrl)
  if (!m) return null
  const mime = m[1] || "image/png"
  const isBase64 = !!m[2]
  const data = m[3]
  const bytes = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8")
  return { mime, bytes }
}

export async function GET() {
  try {
    const studioId = await getStudioIdBySubdomain()
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { logoUrl: true, faviconUrl: true },
    })
    // Prefer logo (larger image, better for home-screen icon),
    // fall back to favicon (smaller, will be scaled by OS).
    const source = studio?.logoUrl ?? studio?.faviconUrl
    if (source) {
      const parsed = parseDataUrl(source)
      if (parsed) {
        return new NextResponse(new Uint8Array(parsed.bytes), {
          headers: {
            "Content-Type": parsed.mime,
            "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
          },
        })
      }
    }
  } catch {
    // Fall through to default
  }
  const file = await readFile(path.join(process.cwd(), "public", "icon-default.png"))
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300",
    },
  })
}
