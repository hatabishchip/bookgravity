import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"
import { readFile } from "fs/promises"
import path from "path"
import sharp from "sharp"

export const dynamic = "force-dynamic"

function parseDataUrl(dataUrl: string): { bytes: Buffer } | null {
  const m = /^data:([^;,]+)(;base64)?,(.+)$/.exec(dataUrl)
  if (!m) return null
  const isBase64 = !!m[2]
  const data = m[3]
  const bytes = isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data), "utf8")
  return { bytes }
}

// Normalize home-screen icon to a square 512×512 PNG with a white background.
// iOS/Android home screens render the supplied square as-is (they may apply
// their own masks), so we need real square pixels — letterboxing inside a
// white square gives a clean look regardless of the source's aspect ratio.
async function normalizeToAppIcon(bytes: Buffer): Promise<Buffer> {
  const img = sharp(bytes).rotate()
  const trimmed = await img.trim().toBuffer().catch(() => null)
  const src = trimmed ? sharp(trimmed) : sharp(bytes)
  return src
    .resize(512, 512, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer()
}

export async function GET(request: NextRequest) {
  try {
    // ?s=<slug> identifies the studio (passed by manifest/page metadata).
    // Falls back to cookie/subdomain/default when absent.
    const studioId = await getPublicStudioId(new URL(request.url).searchParams.get("s"))
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { logoUrl: true, faviconUrl: true },
    })
    // Prefer logo (larger image, better for home-screen icon),
    // fall back to favicon (smaller, will be scaled up).
    const source = studio?.logoUrl ?? studio?.faviconUrl
    if (source) {
      const parsed = parseDataUrl(source)
      if (parsed) {
        const out = await normalizeToAppIcon(parsed.bytes).catch(() => null)
        if (out) {
          return new NextResponse(new Uint8Array(out), {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
            },
          })
        }
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
