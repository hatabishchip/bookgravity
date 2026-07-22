import { Suspense } from "react"
import { redirect } from "next/navigation"
import Inbox from "@/app/_components/Inbox"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth-helpers"

// Per-studio gate. If this studio hasn't been opted into WhatsApp yet by a
// super-admin, bounce direct URL visits to the dashboard so the feature is
// invisible end-to-end (FAB hidden + page hidden + API rejects).
export default async function AdminInboxPage() {
  // Studio comes from the logged-in admin's session (unified login), not the
  // host/path — so a Ubud admin always gets Ubud's inbox.
  const ctx = await requireAdmin()
  if (!ctx) redirect("/login")
  const studioId = ctx.studioId
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { whatsappEnabled: true, slug: true },
  })
  if (!studio?.whatsappEnabled) redirect("/admin")
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-400">Loading…</div>}>
      <Inbox role="ADMIN" studioSlug={studio.slug} />
    </Suspense>
  )
}
