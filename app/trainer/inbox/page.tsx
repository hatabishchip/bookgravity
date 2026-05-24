import { Suspense } from "react"
import { redirect } from "next/navigation"
import Inbox from "@/app/_components/Inbox"
import { prisma } from "@/lib/prisma"
import { getStudioIdBySubdomain } from "@/lib/studio"

export default async function TrainerInboxPage() {
  const studioId = await getStudioIdBySubdomain()
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { whatsappEnabled: true },
  })
  if (!studio?.whatsappEnabled) redirect("/trainer")
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-400">Loading…</div>}>
      <Inbox role="TRAINER" />
    </Suspense>
  )
}
