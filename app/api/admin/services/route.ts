import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const ServiceSchema = z.object({
  name: z.string().min(2),
  price: z.number().min(0),
})

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

export async function GET() {
  const services = await prisma.additionalService.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(services)
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const data = ServiceSchema.parse(body)
  const service = await prisma.additionalService.create({ data })
  return NextResponse.json(service, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 })

  await prisma.additionalService.update({ where: { id }, data: { active: false } })
  return NextResponse.json({ success: true })
}
