// Tiny i18n core for the ADMIN panel (owner 15.07). No library: the English
// string is the key, `lib/i18n/uk.ts` maps it to Ukrainian, and a missing
// entry falls back to the English original. `{name}` placeholders are
// interpolated after lookup.
//
// Client components: useT() from app/_components/LocaleProvider.
// Server components: `const t = await getAdminT()` below.
import { cache } from "react"
import uk from "./uk"
import { uk as ukDate } from "date-fns/locale"
import type { Locale as DateLocale } from "date-fns"

export type AdminLocale = "en" | "uk"

// Per-studio default admin-panel locale, applied when an admin has NOT picked a
// language yet (User.locale is null). Studios not listed default to English.
// Owner 15.07: studio "solar" runs its admin panel in Ukrainian by default.
const STUDIO_DEFAULT_LOCALE: Record<string, AdminLocale> = { solar: "uk" }

/**
 * Resolve an admin's effective locale. An explicit choice ("uk" or "en") always
 * wins - so a solar admin can still switch to English. Only when nothing was
 * chosen yet (null) does the studio default apply.
 */
export function resolveAdminLocale(
  userLocale: string | null | undefined,
  studioSlug: string | null | undefined,
): AdminLocale {
  if (userLocale === "uk") return "uk"
  if (userLocale === "en") return "en"
  return (studioSlug && STUDIO_DEFAULT_LOCALE[studioSlug]) || "en"
}

export function translate(
  locale: AdminLocale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let out = locale === "uk" ? (uk[key] ?? key) : key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  }
  return out
}

/** date-fns locale matching the admin locale (undefined = date-fns default English). */
export function dateLocaleFor(locale: AdminLocale): DateLocale | undefined {
  return locale === "uk" ? ukDate : undefined
}

/** The signed-in admin's locale, for SERVER components. Cached per request. */
export const getAdminLocale = cache(async (): Promise<AdminLocale> => {
  try {
    const { auth } = await import("@/auth")
    const session = await auth()
    const userId = (session?.user as { id?: string } | undefined)?.id
    if (!userId) return "en"
    const { prisma } = await import("@/lib/prisma")
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true, studio: { select: { slug: true } } },
    })
    return resolveAdminLocale(user?.locale, user?.studio?.slug)
  } catch {
    return "en"
  }
})

/** Server-side translator bound to the signed-in admin's locale. */
export async function getAdminT() {
  const locale = await getAdminLocale()
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars)
  return { t, locale, dateLocale: dateLocaleFor(locale) }
}
