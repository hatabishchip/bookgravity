import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getStudioIdBySubdomain } from "@/lib/studio"
import { readFile } from "fs/promises"
import path from "path"

// Always re-evaluate per request — subdomain depends on Host header.
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
      select: { faviconUrl: true },
    })
    if (studio?.faviconUrl) {
      const parsed = parseDataUrl(studio.faviconUrl)
      if (parsed) {
        return new NextResponse(new Uint8Array(parsed.bytes), {
          headers: {
            "Content-Type": parsed.mime,
            // Short cache so changes propagate after upload
            "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
          },
        })
      }
    }
  } catch {
    // Fall through to default
  }
  // Fallback to the bundled default
  const file = await readFile(path.join(process.cwd(), "public", "favicon-default.ico"))
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=300",
    },
  })
}
