import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getAllStudios, STUDIO_COOKIE } from "@/lib/studio"
import StudioChooser from "./_components/StudioChooser"

// Apex landing (bookgravity.com). A single clean URL for both Instagram bios.
//   • Returning visitor (gs_studio cookie set) → straight to their studio.
//   • First-timer → the studio chooser (cover photos + location names).
// The chooser's cards link to /<slug>, where the cookie gets set, so the
// next visit lands directly on the right studio.
export default async function HomePage() {
  const studios = await getAllStudios()

  const cookieStore = await cookies()
  const remembered = cookieStore.get(STUDIO_COOKIE)?.value
  if (remembered && studios.some((s) => s.slug === remembered)) {
    redirect(`/${remembered}`)
  }

  // No remembered studio (or it no longer exists) → show the chooser. If only
  // one studio exists, skip the chooser entirely.
  if (studios.length === 1) {
    redirect(`/${studios[0].slug}`)
  }

  return <StudioChooser studios={studios} />
}
