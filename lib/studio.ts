import { prisma } from "@/lib/prisma"

let cachedDefaultStudioId: string | null = null

// Returns the slug-based default studio id. Cached in-process for performance.
// In future this can be replaced with subdomain or path-based lookup.
export async function getDefaultStudioId(): Promise<string> {
  if (cachedDefaultStudioId) return cachedDefaultStudioId
  const studio = await prisma.studio.findFirst({
    where: { isDefault: true },
    select: { id: true },
  })
  if (!studio) throw new Error("No default studio configured")
  cachedDefaultStudioId = studio.id
  return cachedDefaultStudioId
}
