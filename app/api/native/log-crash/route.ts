import { NextRequest, NextResponse } from "next/server"
import { elog } from "@/lib/elog"

// POST /api/native/log-crash
// The mobile ErrorBoundary reports a render crash here so it lands in EventLog
// automatically - no need for the user to screenshot the error. Unauthenticated
// on purpose (a crashing app may have a broken/expired token) and best-effort;
// we only store a bounded, sanitised payload.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      message?: unknown
      stack?: unknown
      componentStack?: unknown
      platform?: unknown
      appVersion?: unknown
      role?: unknown
      studioSlug?: unknown
      kind?: unknown
    }
    const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined)
    // kind "recovery" = a self-heal event (stale cache auto-fixed, WebView
    // reloaded). Logged under its own scope at warn level so the crash
    // watcher doesn't page anyone about something that already fixed itself.
    const isRecovery = body.kind === "recovery"
    await elog(
      isRecovery ? "native:recovered" : "native:crash",
      s(body.message, 300) || "unknown mobile crash",
      {
        stack: s(body.stack, 2000),
        componentStack: s(body.componentStack, 2000),
        platform: s(body.platform, 20),
        appVersion: s(body.appVersion, 20),
        role: s(body.role, 20),
        studioSlug: s(body.studioSlug, 40),
      },
      isRecovery ? "warn" : "error",
    )
  } catch {
    // Never let crash-reporting itself error.
  }
  // Always 200 so the client never retries a report in a loop.
  return NextResponse.json({ ok: true })
}
