import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@libsql/client", "@prisma/adapter-libsql"],

  // Legacy studio subdomains are retired — everything lives on the apex now
  // (bookgravity.com/canggu, /ubud). 308-redirect old subdomain links to the
  // matching path so existing QR codes, bookmarks and search results keep
  // working and pass their SEO to the new URLs.
  async redirects() {
    return [
      // Subdomain root → that studio's booking page on the apex.
      {
        source: "/",
        has: [{ type: "host", value: "(?<sub>canggu|ubud)\\.bookgravity\\.com" }],
        destination: "https://bookgravity.com/:sub",
        permanent: true,
      },
      // Any other subdomain path → same path on the apex (e.g. /admin, /login).
      // The studio is determined by login now, so we simply drop the subdomain.
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?:canggu|ubud)\\.bookgravity\\.com" }],
        destination: "https://bookgravity.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
