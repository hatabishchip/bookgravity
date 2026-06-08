import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { getAllStudios, STUDIO_COOKIE } from "@/lib/studio"
import StudioChooser, { COUNTRY_COOKIE } from "./_components/StudioChooser"

// Apex landing (bookgravity.com). A single clean URL for every Instagram bio.
//   • Returning visitor (gs_studio cookie set) → straight to their studio.
//   • First-timer → the chooser: pick a COUNTRY (flags) → then a studio. With
//     one country we skip straight to its studios.
// The chooser's cards link to /<slug>, where the cookie gets set, so the next
// visit lands directly on the right studio.
export default async function HomePage() {
  const studios = await getAllStudios()

  const cookieStore = await cookies()
  const remembered = cookieStore.get(STUDIO_COOKIE)?.value
  if (remembered && studios.some((s) => s.slug === remembered)) {
    redirect(`/${remembered}`)
  }

  // Only one studio total → skip the chooser entirely.
  if (studios.length === 1) {
    redirect(`/${studios[0].slug}`)
  }

  // Auto-detect the visitor's country from Vercel's geo header (no permission
  // prompt). The chooser only uses it to pre-select a country that actually
  // has studios — otherwise it shows the country grid.
  const hdrs = await headers()
  const detectedCountry =
    (hdrs.get("x-vercel-ip-country") || "").toUpperCase() || null
  const rememberedCountry = cookieStore.get(COUNTRY_COOKIE)?.value || null

  return (
    <StudioChooser
      studios={studios}
      detectedCountry={detectedCountry}
      rememberedCountry={rememberedCountry}
    />
  )
}
