import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const UpdateSchema = z.object({
  paymentType: z.enum(["ONLINE", "OFFLINE", "PENDING"]).optional(),
  paymentStatus: z.enum(["PAID", "UNPAID"]).optional(),
  notes: z.string().optional(),
  status: z.enum(["CONFIRMED", "CANCELLED"]).optional(),
})

async function requireAdmin() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const data = UpdateSchema.parse(body)

  const booking = await prisma.booking.update({
    where: { id },
    data,
    include: {
      slot: { include: { trainer: { select: { name: true } } } },
      services: { include: { service: true } },
    },
  })

  return NextResponse.json(booking)
}
