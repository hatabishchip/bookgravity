import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { getPublicStudioId } from "@/lib/studio"

export const dynamic = "force-dynamic"

// Lightweight studio info. Two consumers:
//   1. Admin / trainer sidebars (authenticated) — always the studio tied to
//      the logged-in account, including SUPER_ADMIN (pinned to their own
//      studio so browsing a public /[studio] page can't switch it).
//   2. Public booking page — resolves via ?studio=<slug> / cookie / default.
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    let studioId: string
    if (session?.user?.studioId) {
      studioId = session.user.studioId
    } else {
      studioId = await getPublicStudioId(new URL(request.url).searchParams.get("studio"))
    }

    const studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: {
        id: true,
        name: true,
        slug: true,
        isDefault: true,
        coverUrl: true,
        // Per-studio feature flag for the WhatsApp inbox. False studios
        // hide the FAB and the /admin|/trainer/inbox pages entirely.
        whatsappEnabled: true,
      },
    })
    if (!studio) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(studio)
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}
