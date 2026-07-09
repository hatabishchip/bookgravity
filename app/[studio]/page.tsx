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
import JsonLd from "../_components/JsonLd"
import StudioInfo from "./StudioInfo"
import { countryName } from "@/lib/countries"

// Per-studio booking page: bookgravity.com/canggu, /ubud, etc. The studio is
// the path segment - no subdomains. Unknown slugs 404 (static routes like
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
    select: { name: true, slug: true, city: true, country: true, coverUrl: true },
  })
  if (!studio) return {}
  const place = [studio.city].filter(Boolean).join("")
  const title = place ? `Stretching classes in ${place} - ${studio.name}` : `${studio.name} - Booking`
  const description = place
    ? `Book a stretching class at ${studio.name} in ${place}. See the live schedule and reserve your spot in a few taps.`
    : `Book a stretching class at ${studio.name}. See the live schedule and reserve your spot in a few taps.`
  return {
    title,
    description,
    alternates: { canonical: `/${studio.slug}` },
    openGraph: {
      type: "website",
      siteName: "Gravity Stretching",
      title,
      description,
      url: `https://bookgravity.com/${studio.slug}`,
      images: [{ url: studio.coverUrl || "/og-cover.png", alt: studio.name }],
    },
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
    select: { id: true, name: true, slug: true, country: true, city: true, logoUrl: true, coverUrl: true, locationUrl: true, whatsappEnabled: true, currency: true, groupPrice: true, whatsappDisplayPhone: true },
  })
  if (!studio) notFound()

  const todayStr = new Date().toISOString().slice(0, 10)
  const [services, allStudios, session, upcomingSlots] = await Promise.all([
    prisma.additionalService.findMany({
      where: { active: true, studioId: studio.id },
      orderBy: { name: "asc" },
    }),
    getAllStudios(),
    auth(),
    // Real upcoming prices feed the content block + schema, so the page never
    // advertises a number the calendar doesn't actually offer.
    prisma.timeSlot.findMany({
      where: { studioId: studio.id, publicVisible: true, date: { gte: todayStr }, price: { gt: 0 }, cancelledAt: null },
      select: { classType: true, price: true },
    }),
  ])

  const minPrice = (type: string) => {
    const prices = upcomingSlots.filter((s) => s.classType === type).map((s) => s.price)
    return prices.length ? Math.min(...prices) : undefined
  }
  const pricing = { group: minPrice("GROUP"), private: minPrice("PRIVATE"), kids: minPrice("KIDS") }

  const role = session?.user?.role
  // SUPER_ADMIN (platform owner) acts as an admin everywhere - proxy.ts lets
  // them into /admin, so the booking page must recognise them too.
  const isAdminish = role === "ADMIN" || role === "SUPER_ADMIN"
  const dashboardHref = isAdminish ? "/admin" : role === "TRAINER" ? "/trainer" : null
  // The top-right staff badge shows ONLY: a trainer's own name, or just
  // "Admin" for any admin - no "Signed in as", no email, no other details.
  let badgeLabel: string | null = isAdminish ? "Admin" : null
  if (!badgeLabel && role === "TRAINER" && session?.user?.id) {
    const trainer = await prisma.trainer.findFirst({
      where: { userId: session.user.id },
      select: { name: true },
    })
    badgeLabel = trainer?.name?.trim() || "Trainer"
  }

  // Local-business structured data so this studio can show up in Google's
  // local results / map pack for "stretching <city>" queries.
  const businessLd = {
    "@context": "https://schema.org",
    "@type": ["HealthClub", "SportsActivityLocation"],
    name: studio.name,
    url: `https://bookgravity.com/${studio.slug}`,
    image: studio.coverUrl || studio.logoUrl || "https://bookgravity.com/og-cover.png",
    ...(studio.locationUrl ? { hasMap: studio.locationUrl } : {}),
    ...(studio.city || studio.country
      ? {
          address: {
            "@type": "PostalAddress",
            ...(studio.city ? { addressLocality: studio.city } : {}),
            ...(studio.country ? { addressCountry: countryName(studio.country) } : {}),
          },
        }
      : {}),
    ...(studio.city ? { areaServed: studio.city } : {}),
    // Real price range from upcoming public classes (when known) so Google can
    // show price hints in local results.
    ...(pricing.group
      ? {
          priceRange: `${pricing.group}${pricing.private ? `-${pricing.private}` : ""} ${
            (studio.currency || "IDR").toUpperCase() !== "IDR"
              ? (studio.currency || "").toUpperCase()
              : (studio.country || "").toUpperCase() === "KZ" ? "KZT" : "IDR"
          }`,
        }
      : {}),
    sport: "Stretching",
  }

  return (
    <div className="min-h-screen bg-sand">
      <JsonLd data={businessLd} />
      {/* Remember this studio so the apex redirects here next time */}
      <StudioCookieSync slug={studio.slug} />

      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Brand only - the studio (Canggu/Ubud) is conveyed by the
                switcher pills below, so we don't repeat it in the title.
                Not an h1: the page's h1 ("Stretching classes in <city>")
                lives in the content block below the widget. */}
            <div className="text-base sm:text-xl font-bold text-brand tracking-tight truncate">
              Gravity Stretching
            </div>
            {/* Location switcher - shows the active studio, tap to change */}
            <div className="mt-1.5">
              <StudioSwitcher
                studios={allStudios
                  // Only sibling studios in the SAME country - a visitor on
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
              // Signed-in staff: just the trainer's name, or "Admin" - no
              // "Signed in as", no email. Tapping it returns to the dashboard.
              <Link
                href={dashboardHref}
                aria-label={`Open dashboard (${badgeLabel})`}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 text-brand text-xs font-medium px-3 py-1.5 hover:bg-brand/20 max-w-[200px]"
              >
                <span className="truncate">{badgeLabel}</span>
                <span aria-hidden className="flex-shrink-0">›</span>
              </Link>
            ) : (
              <Link
                href="/login"
                aria-label="Staff sign in"
                className="text-gray-300 hover:text-brand text-xs"
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

      {/* Crawlable substance: about, pricing, FAQ (+FAQPage/Breadcrumb JSON-LD),
          location and cross-studio links. The widget alone is invisible to SEO. */}
      <StudioInfo
        studio={studio}
        pricing={pricing}
        siblings={allStudios
          .filter((s) => s.slug !== studio.slug)
          .map((s) => ({ slug: s.slug, city: s.city, name: s.name }))}
      />

      <SiteFooter variant={(studio.country || "").toUpperCase() === "US" ? "us" : "id"} />
    </div>
  )
}
