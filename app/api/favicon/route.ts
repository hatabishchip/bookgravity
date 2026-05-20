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

// "Good" favicon source = the image is reasonably large and roughly square.
// Tiny or non-square uploads usually contain a fraction of a real logo on a
// big transparent canvas and produce a blurry, unrecognizable tab icon, so
// we fall back to the studio's full-resolution logo when available.
async function isGoodSource(bytes: Buffer): Promise<boolean> {
  try {
    const m = await sharp(bytes).metadata()
    const w = m.width ?? 0
    const h = m.height ?? 0
    if (w < 96 || h < 96) return false
    const ratio = Math.max(w, h) / Math.min(w, h)
    return ratio <= 1.2
  } catch {
    return false
  }
}

export async function GET() {
  try {
    const studioId = await getStudioIdBySubdomain()
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { faviconUrl: true, logoUrl: true },
    })

    // Pick the best available source: a "good" favicon upload wins; otherwise
    // use the logo (typically a higher-resolution brand mark); otherwise fall
    // back to whatever favicon bytes we do have.
    const candidates: Buffer[] = []
    const favParsed = studio?.faviconUrl ? parseDataUrl(studio.faviconUrl) : null
    const logoParsed = studio?.logoUrl ? parseDataUrl(studio.logoUrl) : null

    if (favParsed && (await isGoodSource(favParsed.bytes))) candidates.push(favParsed.bytes)
    else {
      if (logoParsed) candidates.push(logoParsed.bytes)
      if (favParsed) candidates.push(favParsed.bytes)
    }

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
