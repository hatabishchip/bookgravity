import { NextResponse } from "next/server"

// Latest PUBLISHED store versions of the mobile app, for the in-app
// full-screen update prompt (owner metaprompt 12.07: "Update / Later" when a
// new version is out for Android and iPhone).
//
//  - iOS: official iTunes Lookup API by app id.
//  - Android: the Play listing page (no official API); the current version
//    sits in the embedded AF_initDataCallback payload. Scrape defensively -
//    any change in the page just yields null, never an error to the app.
// Cached for 6h per serverless instance; a stale value only delays the
// prompt, never breaks anything.

const IOS_APP_ID = "6784350273"
const ANDROID_PACKAGE = "com.bookgravity.gravitystretching"
const TTL_MS = 6 * 60 * 60 * 1000

let cache: { at: number; ios: string | null; android: string | null } | null = null

async function iosVersion(): Promise<string | null> {
  try {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${IOS_APP_ID}`, { cache: "no-store" })
    if (!r.ok) return null
    const d = (await r.json()) as { results?: { version?: string }[] }
    return d.results?.[0]?.version ?? null
  } catch { return null }
}

async function androidVersion(): Promise<string | null> {
  try {
    const r = await fetch(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&hl=en`, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    })
    if (!r.ok) return null
    const html = await r.text()
    // "Current version" in the page data blob, e.g. [[["1.0.3"]],...
    const m = html.match(/\[\[\["(\d+(?:\.\d+)+)"\]\]/)
    return m?.[1] ?? null
  } catch { return null }
}

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const [ios, android] = await Promise.all([iosVersion(), androidVersion()])
    // Keep the previous good value if a source temporarily returns nothing.
    cache = { at: Date.now(), ios: ios ?? cache?.ios ?? null, android: android ?? cache?.android ?? null }
  }
  return NextResponse.json({ ios: cache.ios, android: cache.android })
}
