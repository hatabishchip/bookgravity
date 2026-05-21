import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
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

// Renders the studio's logo at a sensible size for embedding in emails.
// Caller passes ?s={slug} — we look up the studio globally, because emails
// open in a recipient's inbox without any subdomain context. Output is a
// trimmed, max-300px PNG with a transparent background so it composes well
// with both light- and dark-themed email clients.
//
// Cached aggressively (1h) — logos change rarely, and the Resend pipeline
// would otherwise hit this endpoint every time the email is rendered.
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get("s")?.trim()
  if (!slug) return defaultLogo()

  try {
    const studio = await prisma.studio.findUnique({
      where: { slug },
      select: { logoUrl: true, faviconUrl: true },
    })
    const source = studio?.logoUrl ?? studio?.faviconUrl
    if (source) {
      const parsed = parseDataUrl(source)
      if (parsed) {
        const trimmed = await sharp(parsed.bytes).rotate().trim().toBuffer().catch(() => null)
        const out = await sharp(trimmed ?? parsed.bytes)
          .resize(300, 300, {
            fit: "inside",
            withoutEnlargement: false,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer()
          .catch(() => null)
        if (out) {
          return new NextResponse(new Uint8Array(out), {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
            },
          })
        }
      }
    }
  } catch {
    // Fall through
  }
  return defaultLogo()
}

async function defaultLogo() {
  const file = await readFile(path.join(process.cwd(), "public", "icon-default.png"))
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
