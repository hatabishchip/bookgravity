import { Suspense } from "react"
import { redirect } from "next/navigation"
import Inbox from "@/app/_components/Inbox"
import { prisma } from "@/lib/prisma"
import { requireTrainer } from "@/lib/auth-helpers"
import { PetalSpinner } from "@/app/_components/PetalSpinner"

export default async function TrainerInboxPage() {
  // Studio from the logged-in trainer's session (unified login).
  const ctx = await requireTrainer()
  if (!ctx) redirect("/login")
  const studioId = ctx.studioId
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { whatsappEnabled: true, slug: true },
  })
  if (!studio?.whatsappEnabled) redirect("/trainer")
  return (
    <Suspense fallback={<PetalSpinner />}>
      <Inbox role="TRAINER" studioSlug={studio.slug} />
    </Suspense>
  )
}
