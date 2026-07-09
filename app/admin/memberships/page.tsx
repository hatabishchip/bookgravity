// Admin "Member cards" section (Sveta 10.07: selling existed only in the
// trainer cabinet's menu - the admin needs the same registry + Sell button).
// The trainer page is role-agnostic (the /api/memberships endpoints scope by
// the caller's studio), so the admin route just reuses it.
export { default } from "@/app/trainer/memberships/page"
