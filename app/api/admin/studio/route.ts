import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { setWhatsAppProfilePictureFromDataUrl } from "@/lib/whatsapp-cloud"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"

const MAX_DATA_URL_LEN = 1_500_000 // ~1MB of base64 = ~750KB of real image
const MAX_COVER_URL_LEN = 3_500_000 // cover photos are larger (full-bleed)

// Languages we offer in the inbox dropdown. Two-letter ISO 639-1 lowercase.
// Add codes here as we grow; the translation lib accepts any 2-letter code
// already, this list is purely about constraining what admins can pick in
// the UI.
const SUPPORTED_INBOX_LANGS = ["en", "ru", "id", "es", "it", "fr", "de"] as const

const StudioUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  logoUrl: z.string().max(MAX_DATA_URL_LEN).nullable().optional(),
  faviconUrl: z.string().max(MAX_DATA_URL_LEN).nullable().optional(),
  coverUrl: z.string().max(MAX_COVER_URL_LEN).nullable().optional(),
  // Maps/location link shown in the client's WhatsApp confirmation. Empty → null.
  locationUrl: z.string().trim().max(2000).nullable().optional(),
  groupPrice: z.number().min(0).optional(),
  kidsPrice: z.number().min(0).optional(),
  privatePrice: z.number().min(0).optional(),
  // Optional ISO 639-1 lowercase code, or null to turn translation off.
  inboxLanguage: z.enum(SUPPORTED_INBOX_LANGS).nullable().optional(),
})

const STUDIO_SELECT = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  faviconUrl: true,
  coverUrl: true,
  locationUrl: true,
  isDefault: true,
  groupPrice: true,
  kidsPrice: true,
  privatePrice: true,
  inboxLanguage: true,
} as const

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: STUDIO_SELECT,
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
    select: STUDIO_SELECT,
  })

  // Auto-sync the studio logo to the WhatsApp Business profile picture
  // whenever the admin uploads / replaces it. Fire-and-forget so a slow
  // Meta API call doesn't block the admin save.
  if (parsed.data.logoUrl && parsed.data.logoUrl.startsWith("data:")) {
    void (async () => {
      try {
        if (!(await isStudioWhatsAppEnabled(ctx.studioId))) return
        const r = await setWhatsAppProfilePictureFromDataUrl(parsed.data.logoUrl as string)
        if (!r.ok) {
          console.warn("[admin/studio] WA profile picture sync failed:", r.error)
        } else {
          console.log("[admin/studio] WA profile picture synced")
        }
      } catch (err) {
        console.error("[admin/studio] WA profile picture sync exception:", err)
      }
    })()
  }

  return NextResponse.json(studio)
}
