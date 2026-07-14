import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@libsql/client", "@prisma/adapter-libsql"],
  // We query the DB through the libSQL driver adapter, so Prisma's native query
  // engine binaries (~164MB across every platform) are never loaded at runtime.
  // Next was tracing them into each serverless function, pushing /[studio] to
  // 317MB and over Vercel's 250MB function limit (deploys then hung on the
  // large-functions beta). Exclude the engines + the Prisma CLI from tracing so
  // functions stay small and deploys go the normal, reliable path.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@prisma/engines/**",
      "node_modules/prisma/**",
      "node_modules/.prisma/client/libquery_engine-*",
      "node_modules/.prisma/client/query_engine-*",
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
