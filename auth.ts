import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"
import { getStudioIdBySubdomain } from "@/lib/studio"

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
      async authorize(credentials) {
        const email = credentials?.email as string
        const password = credentials?.password as string
        if (!email || !password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) return null

        const valid = await bcrypt.compare(password, user.password)
        if (!valid) return null

        // Enforce studio isolation: an ADMIN / TRAINER can only log in on
        // their own studio's subdomain. SUPER_ADMIN bypasses this — they
        // own the platform and must reach /super-admin from any host.
        if (user.role !== "SUPER_ADMIN") {
          const currentStudioId = await getStudioIdBySubdomain()
          if (user.studioId !== currentStudioId) return null
        }

        return { id: user.id, email: user.email, role: user.role, studioId: user.studioId, name: user.email }
      },
    }),
  ],
})
