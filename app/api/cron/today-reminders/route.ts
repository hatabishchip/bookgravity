import { NextRequest, NextResponse } from "next/server"
import { assertCronAuth } from "@/lib/cron-auth"
import { runTodayReminders } from "@/lib/today-reminders"

export const dynamic = "force-dynamic"
// Sending several reminders sequentially can exceed the default 10s.
export const maxDuration = 60

// Same-day "are you still coming?" check-in. Core logic lives in
// lib/today-reminders.ts (shared with the traffic-driven fallback tick).
// Pinged by the GitHub Actions workflow (with Bearer CRON_SECRET) — see
// .github/workflows/today-reminders.yml.
export async function GET(req: NextRequest) {
  const denied = assertCronAuth(req)
  if (denied) return denied
  const summary = await runTodayReminders("cron-endpoint")
  return NextResponse.json(summary)
}
