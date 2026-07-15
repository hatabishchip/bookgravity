// PATCH /api/admin/agent-lessons  { id, active }
//
// Toggle a self-learning lesson on/off from the agent-stats page. Canggu-only
// (same gate as the stats endpoint). Lessons are appended to the agent's
// system prompt at generation time, so a toggle takes effect within a minute
// (lesson cache TTL) - no deploy.
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

export const dynamic = "force-dynamic"

const Schema = z.object({ id: z.string().min(1), active: z.boolean() })

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { slug: true },
  })
  if (studio?.slug !== "canggu") {
    return NextResponse.json({ error: "Agent is enabled for the Canggu studio only" }, { status: 404 })
  }

  const parsed = Schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const updated = await prisma.agentLesson
    .update({ where: { id: parsed.data.id }, data: { active: parsed.data.active } })
    .catch(() => null)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true, lesson: { id: updated.id, active: updated.active } })
}
