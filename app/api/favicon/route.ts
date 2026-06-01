import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { readFile } from "fs/promises"
import path from "path"
import sharp from "sharp"

// Always re-evaluate per request — subdomain depends on Host header.
export const dynamic = "force-dynamic"

function parseDataUrl(dataUrl: string): { bytes: Buffer } | null {
  const m = /^data:([^;,]+)(;base64)?,(.+)$/.exec(dataUrl)
  if (!m) return null
  const isBase64 = !!m[2]
  const data = m[3]
  const bytes = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8")
  return { bytes }
}

// Normalize whatever the admin uploaded into a square 128×128 PNG with a
// transparent background. Trims existing padding so the glyph fills, then
// letterboxes back to a square.
async function normalizeToFavicon(bytes: Buffer): Promise<Buffer> {
  const trimmed = await sharp(bytes).rotate().trim().toBuffer().catch(() => null)
  const src = trimmed ? sharp(trimmed) : sharp(bytes).rotate()
  return src
    .resize(128, 128, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
}

export async function GET(request: NextRequest) {
  try {
    // ?s=<slug> identifies the studio (passed by layout/page metadata). Falls
    // back to cookie/subdomain/default when absent.
    const studioId = await getPublicStudioId(new URL(request.url).searchParams.get("s"))
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { logoUrl: true },
    })

    // The favicon is always derived from the studio logo — one image to manage.
    const candidates: Buffer[] = []
    const logoParsed = studio?.logoUrl ? parseDataUrl(studio.logoUrl) : null
    if (logoParsed) candidates.push(logoParsed.bytes)

    for (const bytes of candidates) {
      const out = await normalizeToFavicon(bytes).catch(() => null)
      if (out) {
        return new NextResponse(new Uint8Array(out), {
          headers: {
            "Content-Type": "image/png",
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
