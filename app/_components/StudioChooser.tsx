"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect, useMemo } from "react"
import { ArrowRight, ChevronLeft, MapPin } from "lucide-react"
import SiteFooter from "./SiteFooter"
import { flagEmoji, countryName } from "@/lib/countries"

// Cookie remembering the visitor's chosen country, so a return visit lands on
// their country's studios without re-picking. Read on the server (app/page).
export const COUNTRY_COOKIE = "gs_country"

type StudioOption = {
  slug: string
  name: string
  isDefault: boolean
  coverUrl?: string | null
  country?: string | null
  city?: string | null
}

// Public label for a studio = its city (the "Gravity Stretching" prefix is
// branding, shown once in the header). Falls back to stripping the prefix from
// the name, then the raw name.
function cityLabel(s: StudioOption): string {
  if (s.city && s.city.trim()) return s.city.trim()
  return s.name.replace(/^\s*gravity\s*stretching\s*/i, "").trim() || s.name
}

function setCountryCookie(code: string) {
  try {
    document.cookie = `${COUNTRY_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  } catch {}
}

export default function StudioChooser({
  studios,
  detectedCountry,
  rememberedCountry,
}: {
  studios: StudioOption[]
  detectedCountry?: string | null
  rememberedCountry?: string | null
}) {
  const router = useRouter()
  const [going, setGoing] = useState<string | null>(null)

  // Countries that actually have studios, with a count; the default-studio's
  // country leads so Indonesia (Canggu) comes first.
  const countries = useMemo(() => {
    const map = new Map<string, { code: string; count: number; hasDefault: boolean }>()
    for (const s of studios) {
      const code = (s.country || "").toUpperCase()
      if (!code) continue
      const e = map.get(code) || { code, count: 0, hasDefault: false }
      e.count += 1
      if (s.isDefault) e.hasDefault = true
      map.set(code, e)
    }
    return [...map.values()].sort(
      (a, b) =>
        Number(b.hasDefault) - Number(a.hasDefault) ||
        countryName(a.code).localeCompare(countryName(b.code)),
    )
  }, [studios])

  const multiCountry = countries.length > 1
  const codeSet = useMemo(() => new Set(countries.map((c) => c.code)), [countries])

  // Initial country: remembered → else auto-detected (only if it has studios).
  const remembered =
    rememberedCountry && codeSet.has(rememberedCountry.toUpperCase())
      ? rememberedCountry.toUpperCase()
      : null
  const detected =
    !remembered && detectedCountry && codeSet.has(detectedCountry.toUpperCase())
      ? detectedCountry.toUpperCase()
      : null

  const [selected, setSelected] = useState<string | null>(
    !multiCountry ? countries[0]?.code ?? null : remembered ?? detected ?? null,
  )
  // Banner "we think you're in X" — only when we auto-picked by geo.
  const [autoNote, setAutoNote] = useState<boolean>(!!detected && multiCountry)

  useEffect(() => {
    studios.forEach((s) => router.prefetch(`/${s.slug}`))
  }, [studios, router])

  const pickStudio = (slug: string) => {
    setGoing(slug)
    router.push(`/${slug}`)
  }
  const pickCountry = (code: string) => {
    setCountryCookie(code)
    setAutoNote(false)
    setSelected(code)
  }
  const backToCountries = () => {
    setAutoNote(false)
    setSelected(null)
  }

  const showCountryGrid = multiCountry && !selected
  const visibleStudios = selected
    ? studios.filter((s) => (s.country || "").toUpperCase() === selected)
    : studios

  return (
    <div className="min-h-[100svh] bg-gradient-to-b from-sand to-[#E8E6DD] flex flex-col">
      <header className="pt-10 pb-6 px-4 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-brand tracking-tight">
          Gravity Stretching
        </h1>
        <p className="text-gray-500 text-sm mt-2">
          {showCountryGrid ? "Choose your country" : "Choose your studio"}
        </p>
      </header>

      <div className="flex-1 w-full max-w-3xl mx-auto px-4 pb-10 flex flex-col justify-center">
        {showCountryGrid ? (
          /* ---- Phase 1: country flags ---- */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {countries.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => pickCountry(c.code)}
                aria-label={`${countryName(c.code)} studios`}
                className="group flex items-center gap-4 rounded-2xl bg-white ring-1 ring-black/5 shadow-sm px-5 py-4 text-left transition-all hover:shadow-md hover:ring-brand/30 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-brand/30"
              >
                <span className="text-4xl leading-none" aria-hidden>{flagEmoji(c.code)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-gray-900 truncate">{countryName(c.code)}</span>
                  <span className="block text-xs text-gray-500">
                    {c.count} {c.count === 1 ? "studio" : "studios"}
                  </span>
                </span>
                <ArrowRight size={18} className="text-gray-300 group-hover:text-brand transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          /* ---- Phase 2: studios in the chosen country ---- */
          <div className="w-full">
            {multiCountry && (
              <div className="mb-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={backToCountries}
                  className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand"
                >
                  <ChevronLeft size={16} /> Countries
                </button>
                {selected && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <span aria-hidden>{flagEmoji(selected)}</span> {countryName(selected)}
                  </span>
                )}
              </div>
            )}

            {autoNote && selected && (
              <div className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-brand/5 border border-brand/15 px-4 py-2.5 text-sm text-brand">
                <MapPin size={15} className="flex-shrink-0" />
                <span>
                  Looks like you&apos;re in {flagEmoji(selected)} {countryName(selected)}.
                </span>
                <button type="button" onClick={backToCountries} className="font-semibold underline underline-offset-2">
                  Change
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              {visibleStudios.map((s) => {
                const label = cityLabel(s)
                const loading = going === s.slug
                return (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => pickStudio(s.slug)}
                    disabled={!!going}
                    aria-label={`Open ${label} studio`}
                    className="group relative aspect-[4/5] sm:aspect-[3/4] rounded-3xl overflow-hidden shadow-lg ring-1 ring-black/5 bg-brand focus:outline-none focus:ring-4 focus:ring-brand/40 transition-all hover:shadow-2xl active:scale-[0.98] disabled:opacity-80"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.coverUrl || `/studios/${s.slug}.jpg`}
                      alt={label}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                      className="absolute inset-0 w-full h-full object-cover brightness-105 transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/65 via-black/25 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between gap-2">
                      <div className="text-left">
                        <div className="text-white/70 text-[10px] uppercase tracking-[0.25em] font-semibold mb-1">
                          Studio
                        </div>
                        <div className="text-white text-2xl font-bold tracking-tight drop-shadow">
                          {label}
                        </div>
                      </div>
                      <div className="w-9 h-9 rounded-full bg-white/90 text-brand flex items-center justify-center flex-shrink-0 shadow-md group-hover:bg-white transition-colors">
                        {loading ? (
                          <span className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                        ) : (
                          <ArrowRight size={18} />
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  )
}
