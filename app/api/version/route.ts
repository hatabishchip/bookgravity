import { NextResponse } from "next/server"

// The currently-deployed build id (Vercel sets VERCEL_GIT_COMMIT_SHA at build).
// VersionWatcher polls this and reloads the app when the running bundle's baked
// NEXT_PUBLIC_BUILD_ID no longer matches — so a new deploy is picked up without
// any manual cache clearing. Never cached.
export const dynamic = "force-dynamic"

export async function GET() {
  const v = process.env.VERCEL_GIT_COMMIT_SHA || "dev"
  return NextResponse.json(
    { v },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  )
}
