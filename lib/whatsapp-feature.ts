import { prisma } from "@/lib/prisma"

// Per-studio gate for the WhatsApp inbox feature. Returns true only when
// the studio has been explicitly opted in by a super-admin. New studios
// default to false in the schema so we never surface the feature for a
// studio that doesn't yet have a Cloud API number set up.
export async function isStudioWhatsAppEnabled(studioId: string): Promise<boolean> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { whatsappEnabled: true },
  })
  return Boolean(studio?.whatsappEnabled)
}
