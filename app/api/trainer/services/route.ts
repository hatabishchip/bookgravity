import { NextResponse } from "next/server"
import { requireTrainer } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const ctx = await requireTrainer()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const services = await prisma.additionalService.findMany({
    where: { active: true, studioId: ctx.studioId },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(services)
}
