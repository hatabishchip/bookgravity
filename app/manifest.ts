import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"
import { getPublicStudioId } from "@/lib/studio"

// Dynamic Web App Manifest - per-studio name/icon so "Add to home screen" /
// the browser install banner show the studio the visitor is actually on, not
// a hardcoded default.
//
// It used to resolve by SUBDOMAIN only. On the apex bookgravity.com (no
// subdomain) that always fell back to the default studio (Canggu), so an Ubud
// visitor got an "Install Gravity Stretching Canggu" banner with the Canggu
// icon (Sveta 14.07). getPublicStudioId resolves the same way the rest of the
// site does - the gs_studio cookie first (set when the visitor lands on their
// /<slug> page), then subdomain, then default - so the install prompt, home
// icon and splash match the visitor's studio.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = "Gravity Stretching"
  let slug = "default"
  let city: string | null = null
  try {
    const studioId = await getPublicStudioId()
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { name: true, slug: true, city: true },
    })
    if (studio?.name) name = studio.name
    if (studio?.slug) slug = studio.slug
    if (studio?.city) city = studio.city
  } catch {
    // build-time / no DB - fall back to default
  }

  // Icon + start URL are per-studio so Chrome / Android cache keys don't
  // collide across studios (otherwise switching studios shows the wrong
  // splash icon), and launching the installed app opens the right studio.
  const iconUrl = `/api/app-icon?s=${slug}`
  const startUrl = slug === "default" ? "/" : `/${slug}`

  return {
    id: startUrl,
    name,
    short_name: city ? `Gravity ${city}` : name,
    description: "Book your group stretching session",
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#F5F4F0",
    theme_color: "#2C6E49",
    icons: [
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
