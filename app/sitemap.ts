import type { MetadataRoute } from "next"
import { getAllStudios } from "@/lib/studio"

// Built per-request (reads the live studio list) so a newly-added public studio
// shows up in the sitemap without a redeploy.
export const dynamic = "force-dynamic"

const BASE = "https://bookgravity.com"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let studios: { slug: string }[] = []
  try {
    studios = await getAllStudios()
  } catch {
    // DB unreachable at build/request — still emit the static URLs below.
  }

  const now = new Date()
  const studioUrls: MetadataRoute.Sitemap = studios.map((s) => ({
    url: `${BASE}/${s.slug}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.9,
  }))

  return [
    { url: BASE, lastModified: now, changeFrequency: "daily", priority: 1 },
    ...studioUrls,
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/support`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ]
}
