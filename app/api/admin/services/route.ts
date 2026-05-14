import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const ServiceSchema = z.object({
  name: z.string().min(2),
  price: z.number().min(0),
})

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const services = await prisma.additionalService.findMany({
    where: { active: true, studioId: ctx.studioId },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(services)
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const data = ServiceSchema.parse(body)
  const service = await prisma.additionalService.create({ data: { ...data, studioId: ctx.studioId } })
  return NextResponse.json(service, { status: 201 })
}

const ServiceUpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(2).optional(),
  price: z.number().min(0).optional(),
})

export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { id, ...data } = ServiceUpdateSchema.parse(body)

  const existing = await prisma.additionalService.findFirst({ where: { id, studioId: ctx.studioId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const service = await prisma.additionalService.update({ where: { id: existing.id }, data })
  return NextResponse.json(service)
}

export async function DELETE(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  const result = await prisma.additionalService.updateMany({
    where: { id, studioId: ctx.studioId },
    data: { active: false },
  })
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true })
}
