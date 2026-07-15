// GET /api/admin/agent-stats?preset=maximum|last_30d|last_7d
//
// Statistics for the AI sales agent (suggest-mode). Canggu-only by owner's
// decision (15.07.2026) - the agent itself is gated to the Canggu studio in
// lib/sales-agent.ts, and this endpoint 404s for any other studio.
//
// Every AgentSuggestion status change is a training signal, so the numbers
// here double as the health check of the future self-learning loop:
//   sent        - staff trusted the draft as-is (the agent got it right)
//   edited_sent - staff fixed the draft first (a lesson to extract)
//   dismissed   - staff rejected the draft (a stronger lesson)
//   pending     - still waiting for a human decision
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const PRESETS: Record<string, number | null> = {
  maximum: null,
  last_30d: 30,
  last_7d: 7,
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { slug: true },
  })
  if (studio?.slug !== "canggu") {
    return NextResponse.json({ error: "Agent is enabled for the Canggu studio only" }, { status: 404 })
  }

  const preset = req.nextUrl.searchParams.get("preset") ?? "maximum"
  const days = PRESETS[preset] ?? null
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null

  const suggestions = await prisma.agentSuggestion.findMany({
    where: {
      ...(since ? { createdAt: { gte: since } } : {}),
      conversation: { studioId: ctx.studioId },
    },
    orderBy: { createdAt: "desc" },
    include: { conversation: { select: { clientName: true, clientPhone: true } } },
  })

  // Aggregate in JS - suggestion volume is small (per-message, one studio).
  const byCategory = { SAFE: 0, BOOKING: 0, ESCALATE: 0 }
  const byStatus = { pending: 0, sent: 0, edited_sent: 0, auto_sent: 0, dismissed: 0 }
  for (const s of suggestions) {
    if (s.category in byCategory) byCategory[s.category as keyof typeof byCategory]++
    if (s.status in byStatus) byStatus[s.status as keyof typeof byStatus]++
  }
  const decided = byStatus.sent + byStatus.edited_sent + byStatus.dismissed
  const accepted = byStatus.sent + byStatus.edited_sent

  // Self-learning lessons (all of them - the list is short and curated).
  const lessons = await prisma.agentLesson.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, source: true, lesson: true, active: true },
  })

  return NextResponse.json({
    preset,
    total: suggestions.length,
    byCategory,
    byStatus,
    // Of the drafts staff already acted on: how many actually went out.
    acceptanceRate: decided > 0 ? accepted / decided : null,
    // Of the accepted ones: how many needed a human fix first.
    editRate: accepted > 0 ? byStatus.edited_sent / accepted : null,
    recent: suggestions.slice(0, 20).map((s) => ({
      id: s.id,
      clientName: s.conversation?.clientName ?? s.conversation?.clientPhone ?? "?",
      category: s.category,
      status: s.status,
      draft: s.draft ? s.draft.slice(0, 140) : null,
      reason: s.reason,
      createdAt: s.createdAt,
    })),
    lessons,
    generatedAt: new Date().toISOString(),
  })
}
