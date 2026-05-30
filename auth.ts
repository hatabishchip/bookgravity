import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"
import { deviceLabelFromUA } from "@/lib/device-label"

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
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email as string
        const password = credentials?.password as string
        if (!email || !password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) return null

        const valid = await bcrypt.compare(password, user.password)
        if (!valid) return null

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
