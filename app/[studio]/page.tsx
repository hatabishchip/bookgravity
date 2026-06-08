import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getAllStudios } from "@/lib/studio"
import { auth } from "@/auth"
import BookingWidget from "../_components/BookingWidget"
import StudioSwitcher from "../_components/StudioSwitcher"
import StudioCookieSync from "../_components/StudioCookieSync"
import SiteFooter from "../_components/SiteFooter"

// Per-studio booking page: bookgravity.com/canggu, /ubud, etc. The studio is
// the path segment — no subdomains. Unknown slugs 404 (static routes like
// /login, /admin, /privacy win over this dynamic segment automatically).

// Always render per-request so the signed-in staff pill reflects the live
// session cookie (never a cached/anonymous snapshot).
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ studio: string }>
}): Promise<Metadata> {
  const { studio: slug } = await params
  const studio = await prisma.studio.findFirst({
    where: { slug },
    select: { name: true, slug: true },
  })
  if (!studio) return {}
  return {
    title: `${studio.name} — Booking`,
    description: "Book your group stretching session",
    // ?s=<slug> makes the per-studio icon resolve correctly on this path.
    icons: {
      icon: `/api/favicon?s=${studio.slug}`,
      apple: `/api/app-icon?s=${studio.slug}`,
    },
  }
}

export default async function StudioBookingPage({
  params,
}: {
  params: Promise<{ studio: string }>
}) {
  const { studio: slug } = await params

  const studio = await prisma.studio.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true, country: true, city: true, logoUrl: true, locationUrl: true, whatsappEnabled: true },
  })
  if (!studio) notFound()

  const [services, allStudios, session] = await Promise.all([
    prisma.additionalService.findMany({
      where: { active: true, studioId: studio.id },
      orderBy: { name: "asc" },
    }),
    getAllStudios(),
    auth(),
  ])

  const role = session?.user?.role
  // SUPER_ADMIN (platform owner) acts as an admin everywhere — proxy.ts lets
  // them into /admin, so the booking page must recognise them too.
  const isAdminish = role === "ADMIN" || role === "SUPER_ADMIN"
  const dashboardHref = isAdminish ? "/admin" : role === "TRAINER" ? "/trainer" : null
  // The top-right staff badge shows ONLY: a trainer's own name, or just
  // "Admin" for any admin — no "Signed in as", no email, no other details.
  let badgeLabel: string | null = isAdminish ? "Admin" : null
  if (!badgeLabel && role === "TRAINER" && session?.user?.id) {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: session.user.id },
      select: { name: true },
    })
    badgeLabel = trainer?.name?.trim() || "Trainer"
  }

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      {/* Remember this studio so the apex redirects here next time */}
      <StudioCookieSync slug={studio.slug} />

      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Brand only — the studio (Canggu/Ubud) is conveyed by the
                switcher pills below, so we don't repeat it in the title. */}
            <h1 className="text-base sm:text-xl font-bold text-[#2C6E49] tracking-tight truncate">
              Gravity Stretching
            </h1>
            {/* Location switcher — shows the active studio, tap to change */}
            <div className="mt-1.5">
              <StudioSwitcher
                studios={allStudios
                  // Only sibling studios in the SAME country — a visitor on
                  // Bali never sees an Almaty pill.
                  .filter((s) =>
                    (s.country || "").toUpperCase() === (studio.country || "").toUpperCase(),
                  )
                  // Public label = city only (no repeated "Gravity Stretching").
                  .map((s) => ({ slug: s.slug, name: s.city?.trim() || s.name })) }
                activeSlug={studio.slug}
              />
            </div>
          </div>
          <div className="flex items-center flex-shrink-0">
            {dashboardHref && badgeLabel ? (
              // Signed-in staff: just the trainer's name, or "Admin" — no
              // "Signed in as", no email. Tapping it returns to the dashboard.
              <Link
                href={dashboardHref}
                aria-label={`Open dashboard (${badgeLabel})`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#2C6E49]/10 text-[#2C6E49] text-xs font-medium px-3 py-1.5 hover:bg-[#2C6E49]/20 max-w-[200px]"
              >
                <span className="truncate">{badgeLabel}</span>
                <span aria-hidden className="flex-shrink-0">›</span>
              </Link>
            ) : (
              <Link
                href="/login"
                aria-label="Staff sign in"
                className="text-gray-300 hover:text-[#2C6E49] text-xs"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <BookingWidget services={services} studio={studio} studioSlug={studio.slug} />
      </div>

      <SiteFooter />
    </div>
  )
}
