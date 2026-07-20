import Link from "next/link"
import { MapPin, Users, Clock, Sparkles } from "lucide-react"
import JsonLd from "../_components/JsonLd"
import { formatMoney } from "@/lib/format"

// Server-rendered SEO/content block under the booking widget. This is the
// page's crawlable substance - the widget itself is interactive UI that
// search engines can't read meaningfully. Copy targets "stretching classes
// in <city>" and the long-tail questions around it.

export type StudioInfoData = {
  name: string
  slug: string
  city: string | null
  country: string | null
  currency: string | null
  locationUrl: string | null
  /** Admin-editable booking-page intro (null → built-in default). */
  bookingPageTitle: string | null
  bookingPageDescription: string | null
}

export type ClassPricing = {
  /** Min price of upcoming public GROUP slots, 0/undefined → hide price. */
  group?: number
  private?: number
  kids?: number
}

export type SiblingStudio = { slug: string; city: string | null; name: string }

function formatPrice(price: number, currency: string | null, country: string | null): string {
  const cur = (currency || "IDR").toUpperCase()
  // Studios priced in a real currency (e.g. USD for the USA / Online studio)
  // get proper symbols via the shared formatter ("$19").
  if (cur !== "IDR") return formatMoney(price, cur)
  const c = (country || "").toUpperCase()
  if (c === "ID") {
    // Two decimals, trimmed: 1350000 → "1.35M" (toFixed(1) wrongly rounded to "1.4M").
    if (price >= 1_000_000) return `${Math.round((price / 1_000_000) * 100) / 100}M IDR`
    return `${Math.round(price / 1000)}k IDR`
  }
  if (c === "KZ") return `${price.toLocaleString("en-US")} ₸`
  return price.toLocaleString("en-US")
}

function buildFaq(city: string, pricing: ClassPricing, currency: string | null, country: string | null) {
  const faq: { q: string; a: string }[] = [
    {
      q: "How long is a stretching class?",
      a: "Each class is 75-90 minutes: a guided warm-up, gravity stretching with the trainer, and a calm cool-down.",
    },
    {
      q: "Do I need any experience or flexibility to join?",
      a: "No. Classes suit complete beginners and athletes alike - the trainer adjusts every stretch to your current range, so you work at your own depth.",
    },
    {
      q: "What should I wear or bring?",
      a: "Comfortable clothes you can move in. Mats and all equipment are provided at the studio - just bring yourself and some water.",
    },
    {
      q: "How many people are in a group class?",
      a: "Groups are small - up to 6 people - so the trainer can give everyone hands-on attention. Private 1-on-1 sessions are also available.",
    },
    {
      q: "Can I cancel or reschedule my booking?",
      a: "Yes - cancellation is free up to 2 hours before the class. Just tap the Cancel button in your WhatsApp booking confirmation, or message the studio.",
    },
    {
      q: "How do I pay?",
      a: (country || "").toUpperCase() === "US"
        ? "After you book, your coach sends the class link and simple payment details (card or transfer). Regulars save with a 5-class pack or a monthly membership."
        : "You pay at the studio - cash, card, QR or transfer. Regulars save with a 5-class membership; ask your trainer about it after class.",
    },
  ]
  if (pricing.group) {
    faq.splice(3, 0, {
      q: `How much does a stretching class in ${city} cost?`,
      a: (country || "").toUpperCase() === "US"
        ? `The Level 1 online session starts from ${formatPrice(pricing.group, currency, country)}.${
            pricing.private ? ` A full 1-on-1 online program starts from ${formatPrice(pricing.private, currency, country)}.` : ""
          } Booking is free; your coach shares the class link and payment details when you join.`
        : `Group classes start from ${formatPrice(pricing.group, currency, country)} per person.${
            pricing.private ? ` Private 1-on-1 sessions start from ${formatPrice(pricing.private, currency, country)}.` : ""
          } You book your spot online for free and pay at the studio.`,
    })
  }
  return faq
}

export default function StudioInfo({
  studio,
  pricing,
  siblings,
}: {
  studio: StudioInfoData
  pricing: ClassPricing
  siblings: SiblingStudio[]
}) {
  const city = studio.city?.trim() || studio.name
  const faq = buildFaq(city, pricing, studio.currency, studio.country)

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Gravity Stretching", item: "https://bookgravity.com" },
      { "@type": "ListItem", position: 2, name: `Stretching classes in ${city}`, item: `https://bookgravity.com/${studio.slug}` },
    ],
  }

  // The USA / Online studio sells individual online sessions (a $20 "Level 1"
  // intro and a full 1-on-1 program), not physical group/kids classes - so it
  // advertises its own service list. Other studios keep the group/private/kids set.
  const isUS = (studio.country || "").toUpperCase() === "US"
  const classTypes = isUS
    ? [
        {
          icon: Sparkles,
          title: "Level 1 online session",
          desc: `An individual intro online stretching session with your coach${
            pricing.group ? ` - from ${formatPrice(pricing.group, studio.currency, studio.country)}` : ""
          }. A focused first step into the Gravity Stretching method.`,
        },
        {
          icon: Users,
          title: "Full 1-on-1 program",
          desc: `A complete personalized online program focused entirely on your body and goals${
            pricing.private ? ` - from ${formatPrice(pricing.private, studio.currency, studio.country)}` : ""
          }.`,
        },
      ]
    : [
        {
          icon: Users,
          title: "Group class",
          desc: `Up to 6 people, 75-90 minutes of gravity stretching with a trainer${
            pricing.group ? ` - from ${formatPrice(pricing.group, studio.currency, studio.country)} per person` : ""
          }.`,
        },
        {
          icon: Sparkles,
          title: "Private 1-on-1",
          desc: `A full session focused entirely on your body and goals${
            pricing.private ? ` - from ${formatPrice(pricing.private, studio.currency, studio.country)}` : ""
          }. Ideal for deep progress or specific issues.`,
        },
        {
          icon: Clock,
          title: "Kids class",
          desc: "Gentle, playful flexibility training for children, led by trainers experienced with young bodies.",
        },
      ]

  return (
    <section className="max-w-4xl mx-auto px-4 pb-10">
      <JsonLd data={faqLd} />
      <JsonLd data={breadcrumbLd} />

      <div className="space-y-6 mt-2">
        {/* Intro - carries the page's single h1 (keyword + city); the header
            above the widget shows the brand as a plain div. */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          {/* Admin-editable per studio (Settings → Booking page text). Empty
              falls back to the default heading/paragraph below. The custom
              description keeps line breaks the admin typed. */}
          <h1 className="text-lg font-bold text-gray-900">
            {studio.bookingPageTitle?.trim() || `Stretching classes in ${city}`}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 whitespace-pre-line">
            {studio.bookingPageDescription?.trim() ||
              `Gravity Stretching in ${city}. Experience Gravity Stretching - a unique way to relax, release tension, improve mobility, and help your body recover naturally. Sessions improve posture, release tight backs and joints, and simply feel fantastic. Book your spot online in a few taps - no payment needed to reserve.`}
          </p>
        </div>

        {/* Class types */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900">Classes &amp; pricing</h2>
          <ul className="mt-3 grid sm:grid-cols-3 gap-4">
            {classTypes.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="rounded-xl border border-gray-100 p-4">
                <Icon size={18} className="text-brand" aria-hidden />
                <h3 className="mt-2 text-sm font-semibold text-gray-900">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">{desc}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            {(studio.country || "").toUpperCase() === "US"
              ? "Booking is free - your coach sends the class link after you book. Free cancellation up to 2 hours before class."
              : "Booking online is free - you pay at the studio (cash, card, QR or transfer). Free cancellation up to 2 hours before class."}
          </p>
        </div>

        {/* FAQ */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900">Frequently asked questions</h2>
          <dl className="mt-3 divide-y divide-gray-100">
            {faq.map((f) => (
              <div key={f.q} className="py-3">
                <dt className="text-sm font-semibold text-gray-900">{f.q}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-gray-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Location + cross-links */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900">Find us in {city}</h2>
          {studio.locationUrl ? (
            <a
              href={studio.locationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
            >
              <MapPin size={15} aria-hidden /> Open the studio in Google Maps
            </a>
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              Message us on WhatsApp after booking and we&apos;ll send you a pin with directions.
            </p>
          )}

          {siblings.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold text-gray-900">Our other studios</h3>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {siblings.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/${s.slug}`} className="text-sm text-brand hover:underline">
                      Stretching classes in {s.city?.trim() || s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
