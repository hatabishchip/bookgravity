import { NextRequest, NextResponse } from "next/server"

// Shared auth gate for cron endpoints (class reminders, today reminders).
//
// Vercel Cron injects "Authorization: Bearer <CRON_SECRET>" on every scheduled
// invocation when CRON_SECRET is configured. We require it.
//
// Fail-closed in production: if CRON_SECRET is somehow NOT set in a production
// deployment we REJECT the request rather than running open — otherwise anyone
// could hit the endpoint and spam reminder messages to every client. In
// development (no secret) we allow it so the job can be tested locally.
//
// Returns a NextResponse to send back when the request is not authorized, or
// null when the caller may proceed.
export function assertCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return null
  }
  // No secret configured.
  if (process.env.NODE_ENV === "production") {
    console.error("[cron-auth] CRON_SECRET is not set in production — refusing to run open.")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  return null
}
