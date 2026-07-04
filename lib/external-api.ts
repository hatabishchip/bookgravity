import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

// Shared helpers for the /api/external/* surface - the ONLY way the separate
// "studio-sublet" service talks to bookgravity. Auth is a single shared secret
// (EXTERNAL_API_KEY) sent as the `x-api-key` header. Everything here is scoped
// to one studio resolved by its slug, so the external caller never sees other
// studios.

/** True when the request carries the correct shared API key. */
export function hasExternalKey(req: NextRequest): boolean {
  const key = process.env.EXTERNAL_API_KEY
  if (!key) return false // fail closed when unconfigured
  return req.headers.get("x-api-key") === key
}

/** Resolve a studio by its public slug (e.g. "canggu"). */
export async function studioBySlug(slug: string) {
  if (!slug) return null
  return prisma.studio.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } })
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + (m || 0)
}

/** Two [start,end) minute ranges overlap. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export type BusyWindow = { date: string; startTime: string; endTime: string; kind: "class" | "sublet"; label?: string }

/**
 * Everything that occupies the physical room for a studio in [from,to]:
 * class slots (ALL of them - a scheduled class means the room is taken, even a
 * non-public one) plus sublet blocks. This is what "free" is computed against.
 */
export async function studioOccupancy(studioId: string, from: string, to: string): Promise<BusyWindow[]> {
  const [slots, blocks] = await Promise.all([
    prisma.timeSlot.findMany({
      // A cancelled class no longer occupies the room — the window is free
      // for sublets again.
      where: { studioId, date: { gte: from, lte: to }, cancelledAt: null },
      select: { date: true, startTime: true, endTime: true, classType: true },
    }),
    prisma.studioBlock.findMany({
      where: { studioId, date: { gte: from, lte: to } },
      select: { date: true, startTime: true, endTime: true, label: true },
    }),
  ])
  const out: BusyWindow[] = []
  for (const s of slots) out.push({ date: s.date, startTime: s.startTime, endTime: s.endTime, kind: "class" })
  for (const b of blocks) out.push({ date: b.date, startTime: b.startTime, endTime: b.endTime, kind: "sublet", label: b.label ?? undefined })
  out.sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))
  return out
}

/**
 * Is [startTime,endTime) on `date` free of any class slot or sublet block?
 * Returns the first conflicting window, or null if free.
 */
export async function findStudioConflict(
  studioId: string, date: string, startTime: string, endTime: string,
): Promise<BusyWindow | null> {
  const start = timeToMin(startTime)
  const end = timeToMin(endTime)
  const busy = await studioOccupancy(studioId, date, date)
  for (const w of busy) {
    if (rangesOverlap(start, end, timeToMin(w.startTime), timeToMin(w.endTime))) return w
  }
  return null
}
