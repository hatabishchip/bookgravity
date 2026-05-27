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

  // Admin sees ALL services (active + inactive). The public /api/slots etc.
  // still filter active: true, so hidden services stay invisible to clients.
  const services = await prisma.additionalService.findMany({
    where: { studioId: ctx.studioId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
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
  active: z.boolean().optional(),
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

  // BookingService.serviceId has no cascade — try hard delete, but if the
  // service was used in historical bookings, fall back to soft-delete so
  // admin doesn't lose the visibility-toggle option for it.
  const existing = await prisma.additionalService.findFirst({
    where: { id, studioId: ctx.studioId },
    include: { _count: { select: { bookings: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (existing._count.bookings > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: used in ${existing._count.bookings} past booking${existing._count.bookings === 1 ? "" : "s"}. Hide it from clients with the eye toggle instead.`,
      },
      { status: 409 },
    )
  }

  await prisma.additionalService.delete({ where: { id: existing.id } })
  return NextResponse.json({ success: true })
}
