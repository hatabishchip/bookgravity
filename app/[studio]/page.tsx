import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getAllStudios } from "@/lib/studio"
import { auth } from "@/auth"
import BookingWidget from "../_components/BookingWidget"
import StudioSwitcher from "../_components/StudioSwitcher"
import StudioCookieSync from "../_components/StudioCookieSync"

// Per-studio booking page: bookgravity.com/canggu, /ubud, etc. The studio is
// the path segment — no subdomains. Unknown slugs 404 (static routes like
// /login, /admin, /privacy win over this dynamic segment automatically).

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
    select: { id: true, name: true, slug: true, logoUrl: true },
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
  const dashboardHref = role === "ADMIN" ? "/admin" : role === "TRAINER" ? "/trainer" : null
  const signedInLabel = role === "ADMIN" ? "admin" : role === "TRAINER" ? "trainer" : null

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      {/* Remember this studio so the apex redirects here next time */}
      <StudioCookieSync slug={studio.slug} />

      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl font-bold text-[#2C6E49] tracking-tight truncate">
              {studio.name}
            </h1>
            {/* Location switcher — shows the active studio, tap to change */}
            <div className="mt-1.5">
              <StudioSwitcher
                studios={allStudios.map((s) => ({ slug: s.slug, name: s.name }))}
                activeSlug={studio.slug}
              />
            </div>
          </div>
          <div className="flex items-center flex-shrink-0">
            {dashboardHref && signedInLabel ? (
              <Link
                href={dashboardHref}
                aria-label={`Open ${signedInLabel} dashboard`}
                className="text-gray-300 hover:text-[#2C6E49] text-xs"
              >
                {signedInLabel}
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
    </div>
  )
}
