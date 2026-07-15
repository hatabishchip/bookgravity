// GET /api/admin/agent-log?page=1
//
// The owner's journal of agent conversations: what the client asked and what
// was answered, both in RUSSIAN (owner 15.07.2026). Translations are filled
// by the autopilot cron sweep (questionRu / answerRu on AgentSuggestion);
// rows the sweep hasn't reached yet fall back to the original text.
// Canggu-only, same gate as agent-stats.
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 30

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

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1)
  const where = { conversation: { studioId: ctx.studioId } }
  const [total, rows] = await Promise.all([
    prisma.agentSuggestion.count({ where }),
    prisma.agentSuggestion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        category: true,
        status: true,
        draft: true,
        reason: true,
        sentText: true,
        questionRu: true,
        answerRu: true,
        createdAt: true,
        inboundMessageId: true,
        conversation: { select: { clientName: true, clientPhone: true } },
      },
    }),
  ])

  // Original question fallback for rows the translation sweep hasn't reached.
  const needInbound = rows.filter((r) => !r.questionRu && r.inboundMessageId)
  const inbounds = needInbound.length
    ? await prisma.whatsAppMessage.findMany({
        where: { id: { in: needInbound.map((r) => r.inboundMessageId!) } },
        select: { id: true, body: true },
      })
    : []
  const inboundById = new Map(inbounds.map((m) => [m.id, m.body]))

  return NextResponse.json({
    page,
    pageSize: PAGE_SIZE,
    total,
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      clientName: r.conversation?.clientName ?? r.conversation?.clientPhone ?? "?",
      category: r.category,
      status: r.status,
      question: r.questionRu ?? (r.inboundMessageId ? inboundById.get(r.inboundMessageId) ?? null : null),
      questionTranslated: !!r.questionRu,
      answer: r.answerRu ?? r.sentText ?? (r.status === "pending" ? r.draft : null),
      answerTranslated: !!r.answerRu,
    })),
  })
}
