"use client"

import { useRouter } from "next/navigation"
import { MapPin } from "lucide-react"
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
  // Only worth showing when there's an actual choice.
  if (studios.length < 2) return null

  return (
    <div className="inline-flex items-center gap-1.5">
      <MapPin size={14} className="text-[#2C6E49]/60 flex-shrink-0" aria-hidden />
      <div className="inline-flex items-center rounded-full bg-[#2C6E49]/8 p-0.5">
        {studios.map((s) => {
          const active = s.slug === activeSlug
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => {
                if (active) return
                router.push(`/${s.slug}`)
              }}
              aria-current={active ? "true" : undefined}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors leading-none",
                active
                  ? "bg-[#2C6E49] text-white shadow-sm"
                  : "text-[#2C6E49]/70 hover:text-[#2C6E49] hover:bg-white/60",
              )}
            >
              {shortLabel(s.name)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
