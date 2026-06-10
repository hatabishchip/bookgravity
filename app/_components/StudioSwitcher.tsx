"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { MapPin, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type StudioOption = { slug: string; name: string }

// Short, human label for a pill — strips the shared "Gravity Stretching"
// brand prefix so the chip reads just "Canggu" / "Ubud".
function shortLabel(name: string): string {
  return name.replace(/^gravity\s+stretching\s*/i, "").trim() || name
}

// Header segmented control that shows which studio the visitor is browsing
// and lets them flip to another with one tap. Active segment is filled green;
// tapping another segment navigates to /<slug> (which re-sets the cookie on
// the server), so the whole page re-renders for the chosen studio.
export default function StudioSwitcher({
  studios,
  activeSlug,
}: {
  studios: StudioOption[]
  activeSlug: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Slug the user just tapped — highlighted instantly while the new studio's
  // page renders in the background (so the tap feels immediate).
  const [target, setTarget] = useState<string | null>(null)

  // Prefetch both routes so switching lands fast.
  useEffect(() => {
    studios.forEach((s) => router.prefetch(`/${s.slug}`))
  }, [studios, router])

  // Once navigation has resolved (activeSlug now matches), clear the optimistic target.
  useEffect(() => { setTarget(null) }, [activeSlug])

  // Only worth showing when there's an actual choice.
  if (studios.length < 2) return null

  const go = (slug: string) => {
    if (slug === activeSlug || slug === target) return
    setTarget(slug) // instant visual switch
    startTransition(() => router.push(`/${slug}`))
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <MapPin size={14} className="text-brand/60 flex-shrink-0" aria-hidden />
      <div className="inline-flex items-center rounded-full bg-brand/8 p-0.5">
        {studios.map((s) => {
          // Optimistic: the tapped pill reads active immediately, before the
          // server page for that studio has finished rendering.
          const active = s.slug === (target ?? activeSlug)
          const loading = isPending && s.slug === target
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => go(s.slug)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors leading-none",
                active
                  ? "bg-brand text-white shadow-sm"
                  : "text-brand/70 hover:text-brand hover:bg-white/60",
              )}
            >
              {loading && <Loader2 size={11} className="animate-spin" />}
              {shortLabel(s.name)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
