import NextAuth, { type NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import Apple from "next-auth/providers/apple"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"
import { deviceLabelFromUA } from "@/lib/device-label"
import { verifyImpersonationToken } from "@/lib/impersonate"

// Social sign-in (Google / Apple) is an ALTERNATIVE to the email+password
// form, NOT a replacement - staff can still use their password (owner 13.07).
// Providers are added only when their credentials are configured, so a missing
// Apple key can't break the build or the login page.
const socialProviders: NextAuthConfig["providers"] = []
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // We only need identity (email), not offline access - no refresh token,
      // no Calendar scope. Calendar has its OWN separate OAuth flow.
      authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
      allowDangerousEmailAccountLinking: true,
    }),
  )
}
if (process.env.APPLE_ID && process.env.APPLE_SECRET) {
  socialProviders.push(
    Apple({
      clientId: process.env.APPLE_ID,
      clientSecret: process.env.APPLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  )
}

declare module "next-auth" {
  interface User {
    role: string
    studioId?: string
  }
  interface Session {
    user: {
      id: string
      email: string
      role: string
      studioId: string
      name?: string | null
    }
  }
}


export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Social sign-in gate: Google/Apple identify a person by email, but this
    // app has no public accounts - only staff (trainer/admin/super-admin/
    // cleaning) have User rows, created by an admin. So we allow a social
    // login ONLY when its email matches an existing staff user, and we copy
    // that user's id/role/studioId onto the auth `user` so the jwt callback
    // (in auth.config) issues a correctly-scoped session. An unknown email is
    // refused and bounced back to /login with a clear message - we never
    // auto-create an account (that would let anyone with a Google account in).
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" || account?.provider === "apple") {
        const email = (profile?.email as string | undefined)?.toLowerCase().trim()
        if (!email) return "/login?error=NoEmail"
        const dbUser = await prisma.user.findFirst({
          where: { email: { equals: email } },
        })
        if (!dbUser) return "/login?error=NotStaff"
        user.id = dbUser.id
        ;(user as { role?: string }).role = dbUser.role
        ;(user as { studioId?: string }).studioId = dbUser.studioId
        // Record the sign-in for the admin "who's signed in" view (best-effort).
        try {
          await prisma.loginSession.upsert({
            where: { userId_device: { userId: dbUser.id, device: `${account.provider} sign-in` } },
            create: { userId: dbUser.id, device: `${account.provider} sign-in` },
            update: { lastSeenAt: new Date() },
          })
        } catch { /* never block login on telemetry */ }
        return true
      }
      return true
    },
  },
  providers: [
    ...socialProviders,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        // Super-admin impersonation: a signed token minted server-side stands
        // in for email+password to sign in AS the target user.
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials, request) {
        let user
        const token = credentials?.token as string | undefined
        if (token) {
          const userId = verifyImpersonationToken(token)
          if (!userId) return null
          user = await prisma.user.findUnique({ where: { id: userId } })
          if (!user) return null
        } else {
          const email = credentials?.email as string
          const password = credentials?.password as string
          if (!email || !password) return null
          user = await prisma.user.findUnique({ where: { email } })
          if (!user) return null
          const valid = await bcrypt.compare(password, user.password)
          if (!valid) return null
        }

        // Record this browser sign-in for the admin "who's signed in" view.
        // Deduped per (user, device) so the same browser refreshes lastSeenAt
        // instead of stacking rows. Best-effort — never block login on it.
        try {
          const ua = request?.headers?.get?.("user-agent") ?? null
          const device = deviceLabelFromUA(ua)
          await prisma.loginSession.upsert({
            where: { userId_device: { userId: user.id, device } },
            create: { userId: user.id, device, userAgent: ua ?? undefined },
            update: { lastSeenAt: new Date(), userAgent: ua ?? undefined },
          })
        } catch (err) {
          console.warn("[auth] could not record login session:", err)
        }

        // Unified login: a single bookgravity.com login form serves every
        // studio. The studio a user manages is determined purely by their
        // own record (user.studioId) — not by which subdomain/path they
        // logged in from. So no host check here.
        return { id: user.id, email: user.email, role: user.role, studioId: user.studioId, name: user.email }
      },
    }),
  ],
})
