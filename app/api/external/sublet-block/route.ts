import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { hasExternalKey, studioBySlug, findStudioConflict } from "@/lib/external-api"

// Sublet blocks: the studio-sublet service creates/removes these to reserve the
// physical room for a sublease. Auth: x-api-key.
export const dynamic = "force-dynamic"

const CreateSchema = z.object({
  studio: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  label: z.string().max(120).optional(),
  externalRef: z.string().max(64).optional(),
})

// POST - create a block, but only if the room is free (no class slot, no other
// block) for that window. Returns 409 with the conflicting window otherwise.
export async function POST(request: NextRequest) {
  if (!hasExternalKey(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let data
  try {
    data = CreateSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  if (data.startTime >= data.endTime) return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 })

  const studio = await studioBySlug(data.studio)
  if (!studio) return NextResponse.json({ error: "Unknown studio" }, { status: 404 })

  const conflict = await findStudioConflict(studio.id, data.date, data.startTime, data.endTime)
  if (conflict) {
    return NextResponse.json(
      { error: "conflict", message: `${data.date} ${conflict.startTime}-${conflict.endTime} is already taken (${conflict.kind})`, conflict },
      { status: 409 },
    )
  }

  const block = await prisma.studioBlock.create({
    data: {
      studioId: studio.id,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      label: data.label,
      externalRef: data.externalRef,
      source: "SUBLET",
    },
  })
  return NextResponse.json({ ok: true, block })
}

// DELETE /api/external/sublet-block?id=...  OR  ?externalRef=...
export async function DELETE(request: NextRequest) {
  if (!hasExternalKey(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  const externalRef = searchParams.get("externalRef")
  if (!id && !externalRef) return NextResponse.json({ error: "id or externalRef required" }, { status: 400 })

  const res = await prisma.studioBlock.deleteMany({
    where: id ? { id } : { externalRef: externalRef! },
  })
  return NextResponse.json({ ok: true, deleted: res.count })
}
