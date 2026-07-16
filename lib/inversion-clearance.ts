// Inverted-positions clearance gate (Sveta 16.07): an inversion add-on may
// only be sold/added for a class whose trainer OR assistant holds
// Trainer.permInvertedPositions. Shared by the public booking API and both
// staff add-service endpoints.
import { prisma } from "@/lib/prisma"

/** True when the slot's trainer or assistant is cleared for inversions. */
export async function slotAllowsInversions(slotId: string): Promise<boolean> {
  const slot = await prisma.timeSlot.findUnique({
    where: { id: slotId },
    select: {
      trainer: { select: { permInvertedPositions: true } },
      assistant: { select: { permInvertedPositions: true } },
    },
  })
  return !!(slot?.trainer?.permInvertedPositions || slot?.assistant?.permInvertedPositions)
}

export const INVERSION_BLOCKED_MSG =
  "Inverted positions are not available in this class - the trainer running it is not certified for inversions yet."
