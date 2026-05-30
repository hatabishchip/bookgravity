import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"

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

        // Unified login: a single bookgravity.com login form serves every
        // studio. The studio a user manages is determined purely by their
        // own record (user.studioId) — not by which subdomain/path they
        // logged in from. So no host check here.
        return { id: user.id, email: user.email, role: user.role, studioId: user.studioId, name: user.email }
      },
    }),
  ],
})
