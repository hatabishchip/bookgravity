import { prisma } from "@/lib/prisma"
import { headers, cookies } from "next/headers"
import { auth } from "@/auth"

// Cookie that remembers the last public studio a visitor chose. Set when they
// land on /[studio]; read on the apex (bookgravity.com) so a returning client
// skips the chooser and goes straight to their studio. Also used by API +
// asset routes (favicon, app-icon) as the fallback studio when no explicit
// ?studio= is passed.
export const STUDIO_COOKIE = "gs_studio"

let cachedDefaultStudioId: string | null = null

export async function getDefaultStudioId(): Promise<string> {
  if (cachedDefaultStudioId) return cachedDefaultStudioId
  const studio = await prisma.studio.findFirst({
    where: { isDefault: true },
    select: { id: true },
  })
  if (!studio) throw new Error("No default studio configured")
  cachedDefaultStudioId = studio.id
  return cachedDefaultStudioId
}

export async function getStudioIdBySlug(slug: string): Promise<string | null> {
  if (!slug) return null
  const studio = await prisma.studio.findFirst({
    where: { slug },
    select: { id: true },
  })
  return studio?.id ?? null
}

// All studios, for the apex chooser screen. Default studio first so Canggu
// leads. `id` is intentionally omitted — the chooser only needs slug/name.
export type ChooserStudio = {
  slug: string
  name: string
  isDefault: boolean
  coverUrl: string | null
  country: string | null
  city: string | null
}

// Public list for the apex chooser + booking-page switcher. Hidden studios
// (publicVisible = false) are excluded here, but stay reachable directly at
// /<slug> (that path resolves by slug, not through this list).
export async function getAllStudios(): Promise<ChooserStudio[]> {
  return prisma.studio.findMany({
    where: { publicVisible: true },
    select: { slug: true, name: true, isDefault: true, coverUrl: true, country: true, city: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  })
}

// Resolve the studio for an incoming PUBLIC request. Priority:
//   1. explicit slug — from the /[studio] path segment or an ?studio= query
//   2. gs_studio cookie — set when a visitor last picked a studio
//   3. host subdomain — legacy ubud.bookgravity.com still resolves
//   4. default studio — Canggu
// Each step falls through to the next when it can't resolve a real studio.
export async function getPublicStudioId(explicitSlug?: string | null): Promise<string> {
  if (explicitSlug) {
    const id = await getStudioIdBySlug(explicitSlug)
    if (id) return id
  }

  try {
    const cookieStore = await cookies()
    const cookieSlug = cookieStore.get(STUDIO_COOKIE)?.value
    if (cookieSlug) {
      const id = await getStudioIdBySlug(cookieSlug)
      if (id) return id
    }
  } catch {
    // cookies() can throw in some build contexts — fall through
  }

  try {
    const headersList = await headers()
    const host = headersList.get("host") || ""
    if (!host.includes("localhost") && !host.startsWith("127.0.0.1")) {
      const parts = host.split(".")
      if (parts.length > 2) {
        const id = await getStudioIdBySlug(parts[0])
        if (id) return id
      }
    }
  } catch {
    // headers() unavailable — fall through
  }

  return getDefaultStudioId()
}

// Back-compat alias. Callers that don't have an explicit slug (root layout,
// manifest, legacy API routes) keep working via cookie → subdomain → default.
export const getStudioIdBySubdomain = getPublicStudioId

export async function getCurrentUserStudioId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.studioId) {
    throw new Error("Not authenticated or no studio")
  }
  return session.user.studioId
}
