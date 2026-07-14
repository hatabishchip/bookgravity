import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@libsql/client", "@prisma/adapter-libsql"],
  // The file tracer pulls the WHOLE project root into every serverless
  // function (a dynamic `path.resolve(process.cwd(), …)` in lib/prisma.ts
  // makes NFT glob the cwd). That dragged mobile build artifacts (.aab/.ipa,
  // ~170MB in git) + docs/university into all 107 functions -> 317MB each,
  // over Vercel's 250MB limit. Exclude everything a function can never need;
  // public/ stays (the icon routes fs-read from it).
  outputFileTracingExcludes: {
    "*": [
      "./mobile/**",
      "./university/**",
      "./docs/**",
      "./scripts/**",
      "./prisma/migrations/**",
    ],
  },
  // Bake the deploy's commit sha into the client bundle so VersionWatcher can
  // tell when the running app is stale and silently reload to the new deploy
  // (no manual cache clear). "dev" locally where there's no Vercel commit sha.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  },
  // Studios are path-based only now (bookgravity.com/<slug>). The old
  // ubud.bookgravity.com subdomain is retired — detach it in the Vercel
  // dashboard. No subdomain redirects needed.
};

export default nextConfig;
