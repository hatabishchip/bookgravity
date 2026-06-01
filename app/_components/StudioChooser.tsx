"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { ArrowRight } from "lucide-react"

type StudioOption = { slug: string; name: string; isDefault: boolean; coverUrl?: string | null }

function shortLabel(name: string): string {
  return name.replace(/^gravity\s+stretching\s*/i, "").trim() || name
}

// Apex landing (bookgravity.com) when the visitor hasn't picked a studio yet.
// Big tappable cards — a cover photo per studio with the location name below.
// Tapping navigates to /<slug>, where the server sets the gs_studio cookie so
// the next visit skips straight here.
export default function StudioChooser({ studios }: { studios: StudioOption[] }) {
  const router = useRouter()
  const [going, setGoing] = useState<string | null>(null)

  // Warm every studio route up front so the tap lands instantly instead of
  // waiting on a cold server render.
  useEffect(() => {
    studios.forEach((s) => router.prefetch(`/${s.slug}`))
  }, [studios, router])

  const pick = (slug: string) => {
    setGoing(slug)
    router.push(`/${slug}`)
  }

  return (
    <div className="min-h-[100svh] bg-gradient-to-b from-[#F5F4F0] to-[#E8E6DD] flex flex-col">
      {/* Brand header */}
      <header className="pt-10 pb-6 px-4 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#2C6E49] tracking-tight">
          Gravity Stretching
        </h1>
        <p className="text-gray-500 text-sm mt-2">
          Choose your studio
        </p>
      </header>

      {/* Cards */}
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 pb-10 flex items-center">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          {studios.map((s) => {
            const label = shortLabel(s.name)
            const loading = going === s.slug
            return (
              <button
                key={s.slug}
                type="button"
                onClick={() => pick(s.slug)}
                disabled={!!going}
                aria-label={`Open ${label} studio`}
                className="group relative aspect-[4/5] sm:aspect-[3/4] rounded-3xl overflow-hidden shadow-lg ring-1 ring-black/5 bg-[#2C6E49] focus:outline-none focus:ring-4 focus:ring-[#2C6E49]/40 transition-all hover:shadow-2xl active:scale-[0.98] disabled:opacity-80"
              >
                {/* Cover photo. Brand-green button bg shows through if a newer
                    studio doesn't have a cover image yet. */}
                {/* Admin-uploaded cover wins; otherwise the bundled photo.
                    Slight brightness lift so the photo looks vivid, not gloomy. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.coverUrl || `/studios/${s.slug}.jpg`}
                  alt={label}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
                  className="absolute inset-0 w-full h-full object-cover brightness-105 transition-transform duration-500 group-hover:scale-105"
                />
                {/* Soft scrim ONLY along the bottom, behind the label — keeps
                    the top ~⅔ of the photo bright and clean. */}
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/65 via-black/25 to-transparent" />

                {/* Label */}
                <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between gap-2">
                  <div className="text-left">
                    <div className="text-white/70 text-[10px] uppercase tracking-[0.25em] font-semibold mb-1">
                      Studio
                    </div>
                    <div className="text-white text-2xl font-bold tracking-tight drop-shadow">
                      {label}
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-white/90 text-[#2C6E49] flex items-center justify-center flex-shrink-0 shadow-md group-hover:bg-white transition-colors">
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-[#2C6E49]/30 border-t-[#2C6E49] rounded-full animate-spin" />
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

      {/* Staff sign-in — single unified login */}
      <footer className="pb-8 text-center">
        <a href="/login" className="text-xs text-gray-400 hover:text-[#2C6E49]">
          Staff sign in
        </a>
      </footer>
    </div>
  )
}
