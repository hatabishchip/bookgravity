import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"

// Lightweight config for proxy — no database imports
export const authConfig: NextAuthConfig = {
  providers: [Credentials({})],
  // Multi-tenant: we serve admin/trainer dashboards from {studio}.bookgravity.com
  // (e.g. ubud.bookgravity.com). trustHost makes Auth.js honor the incoming
  // request's Host header instead of forcing redirects back to NEXTAUTH_URL,
  // so signing out from ubud.bookgravity.com returns the user to that same
  // host's /login page rather than stripping the subdomain.
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role
        token.id = user.id!
        token.studioId = (user as { studioId?: string }).studioId
      }
      return token
    },
    session({ session, token }) {
      session.user.role = token.role as string
      session.user.id = token.id as string
      session.user.studioId = token.studioId as string
      return session
    },
    // Allow redirects that stay on the same origin. Auth.js's default rewrites
    // a callbackUrl to baseUrl (NEXTAUTH_URL) when it's "external" — but for
    // us a sibling subdomain is the same logical app, not external. Accept any
    // bookgravity.com host; everything else falls back to the request origin.
    redirect({ url, baseUrl }) {
      try {
        const target = new URL(url, baseUrl)
        if (target.origin === baseUrl) return target.toString()
        if (target.hostname.endsWith(".bookgravity.com") || target.hostname === "bookgravity.com") {
          return target.toString()
        }
      } catch {}
      return baseUrl
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
}
