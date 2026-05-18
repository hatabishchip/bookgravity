import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"
import { getStudioIdBySubdomain } from "@/lib/studio"

// Dynamic Web App Manifest — per-studio name/icon so adding to home screen
// works correctly on every subdomain.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = "Gravity Stretching"
  let slug = "default"
  try {
    const studioId = await getStudioIdBySubdomain()
    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { name: true, slug: true },
    })
    if (studio?.name) name = studio.name
    if (studio?.slug) slug = studio.slug
  } catch {
    // build-time / no DB — fall back to default
  }

  // URL is per-studio so Chrome / Android cache keys don't collide across
  // subdomains (otherwise opening ubud.bookgravity.com after canggu shows
  // the wrong splash icon).
  const iconUrl = `/api/app-icon?s=${slug}`

  return {
    name,
    short_name: name,
    description: "Book your group stretching session",
    start_url: "/",
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
