import type { MetadataRoute } from "next"

// Public site is crawlable; private/app areas are not. Points crawlers at the
// sitemap so new studio pages get discovered.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/trainer", "/sadmin", "/api/", "/login", "/auth/"],
    },
    sitemap: "https://bookgravity.com/sitemap.xml",
    host: "https://bookgravity.com",
  }
}
