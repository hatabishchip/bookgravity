// GET/PATCH /api/whatsapp/conversations/[id]/suggestion
// The AI sales agent's pending suggestion for this chat (suggest-mode).
//
// GET   -> the latest pending suggestion (or null).
// PATCH -> { action: "dismiss" }              - staff hid the card
//          { action: "sent", text: "..." }    - staff sent it (possibly edited);
//                                               records sent vs edited_sent so
//                                               the learning loop can diff.
// The actual sending goes through the normal messages POST (with
// agentSuggestionId) - this route only manages the suggestion lifecycle.
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

async function guard(id: string) {
  const ctx = await requireAuth()
  if (!ctx) return null
  const convo = await prisma.whatsAppConversation.findFirst({
    where: { id, studioId: ctx.studioId },
    select: { id: true },
  })
  return convo ? ctx : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await guard(id)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const s = await prisma.agentSuggestion.findFirst({
    where: { conversationId: id, status: "pending" },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ suggestion: s ?? null })
}

// POST -> generate a suggestion NOW for the latest inbound text message
// (on-demand trigger: lets staff ask the agent for a draft on an old chat
// and doubles as the E2E test hook; the webhook path stays the main driver).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await guard(id)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const lastInbound = await prisma.whatsAppMessage.findFirst({
    where: { conversationId: id, direction: "INBOUND", type: "text" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })
  if (!lastInbound) return NextResponse.json({ error: "No inbound text message" }, { status: 404 })
  const { generateAgentSuggestion } = await import("@/lib/sales-agent")
  await generateAgentSuggestion(id, lastInbound.id)
  const s = await prisma.agentSuggestion.findFirst({
    where: { conversationId: id, inboundMessageId: lastInbound.id },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ suggestion: s ?? null })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await guard(id)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { suggestionId?: string; action?: string; text?: string }
  if (!body.suggestionId || !body.action) return NextResponse.json({ error: "suggestionId and action required" }, { status: 400 })
  const s = await prisma.agentSuggestion.findFirst({ where: { id: body.suggestionId, conversationId: id } })
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (body.action === "dismiss") {
    await prisma.agentSuggestion.update({ where: { id: s.id }, data: { status: "dismissed" } })
    return NextResponse.json({ ok: true })
  }
  if (body.action === "sent") {
    const text = (body.text ?? "").trim()
    const edited = !!(s.draft && text && text !== s.draft.trim())
    await prisma.agentSuggestion.update({
      where: { id: s.id },
      data: { status: edited ? "edited_sent" : "sent", sentText: text || s.draft },
    })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
