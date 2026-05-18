import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { auth } from "@/auth"

let cachedDefaultStudioId: string | null = null

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

export async function getStudioIdBySubdomain(): Promise<string> {
  const headersList = await headers()
  const host = headersList.get("host") || ""

  // Extract subdomain from host (e.g., "ubud.bookgravity.com" -> "ubud")
  // Skip subdomain extraction for localhost/127.0.0.1
  let subdomain: string | null = null

  if (!host.includes("localhost") && !host.startsWith("127.0.0.1")) {
    const parts = host.split(".")
    if (parts.length > 2) {
      subdomain = parts[0]
    }
  }

  if (!subdomain) {
    // No subdomain, use default
    return getDefaultStudioId()
  }

  const studio = await prisma.studio.findFirst({
    where: { slug: subdomain },
    select: { id: true },
  })

  if (!studio) {
    // Subdomain studio not found, fallback to default
    return getDefaultStudioId()
  }

  return studio.id
}

export async function getCurrentUserStudioId(): Promise<string> {
  const session = await auth()
  if (!session?.user?.studioId) {
    throw new Error("Not authenticated or no studio")
  }
  return session.user.studioId
}
