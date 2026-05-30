import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@libsql/client", "@prisma/adapter-libsql"],
  // Studios are path-based only now (bookgravity.com/<slug>). The old
  // ubud.bookgravity.com subdomain is retired — detach it in the Vercel
  // dashboard. No subdomain redirects needed.
};

export default nextConfig;
