// Per-studio default admin-panel locale resolution. Kept in its OWN module
// (no react/date-fns imports) so API route handlers can import it without
// pulling in the RSC-only `cache()` + date-fns from lib/i18n.
export type AdminLocale = "en" | "uk"

// Studios not listed default to English. Owner 15.07: studio "solar" runs its
// admin panel in Ukrainian by default.
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
