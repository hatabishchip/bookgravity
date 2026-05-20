import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getStudioIdBySubdomain } from "@/lib/studio"
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
// transparent background. Trims existing transparent padding so the logo
// fills the visible area, then letterboxes the result back to a square.
async function normalizeToFavicon(bytes: Buffer): Promise<Buffer> {
  const img = sharp(bytes).rotate()
  const trimmed = await img.trim().toBuffer().catch(() => null)
  const src = trimmed ? sharp(trimmed) : sharp(bytes)
  return src
    .resize(128, 128, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
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
        const out = await normalizeToFavicon(parsed.bytes).catch(() => null)
        if (out) {
          return new NextResponse(new Uint8Array(out), {
            headers: {
              "Content-Type": "image/png",
              // Short cache so changes propagate after upload
              "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
            },
          })
        }
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
