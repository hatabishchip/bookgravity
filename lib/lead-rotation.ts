import { prisma } from "@/lib/prisma"

// Round-robin picker for auto-assigned WhatsApp leads. The pool is the studio's
// active trainers flagged inLeadRotation; the studio's leadRotationLastTrainerId
// is the cursor (who got the previous lead). We pick the trainer AFTER the
// cursor in a stable order and advance it. Returns null when the pool is empty.
//
// Volume here is a handful of ad leads per studio, so a plain read-pick-write is
// fine; SQLite serializes the cursor write, and a rare double-pick under exactly
// simultaneous webhooks just means two leads land on the same trainer once.
export async function pickNextLeadTrainer(
  studioId: string,
): Promise<{ id: string; name: string; whatsapp: string } | null> {
  const pool = await prisma.trainer.findMany({
    where: { studioId, archived: false, inLeadRotation: true },
    select: { id: true, name: true, whatsapp: true },
    orderBy: { id: "asc" },
  })
  if (pool.length === 0) return null

  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { leadRotationLastTrainerId: true },
  })
  const lastIdx = studio?.leadRotationLastTrainerId
    ? pool.findIndex((t) => t.id === studio.leadRotationLastTrainerId)
    : -1
  // lastIdx === -1 (no cursor or cursor left the pool) → start at the first.
  const next = pool[(lastIdx + 1) % pool.length]

  await prisma.studio.update({
    where: { id: studioId },
    data: { leadRotationLastTrainerId: next.id },
  })
  return next
}
