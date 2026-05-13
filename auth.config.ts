import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"

// Lightweight config for proxy — no database imports
export const authConfig: NextAuthConfig = {
  providers: [Credentials({})],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role
        token.id = user.id!
      }
      return token
    },
    session({ session, token }) {
      session.user.role = token.role as string
      session.user.id = token.id as string
      return session
    },
  },
  pages: {
    signIn: "/admin/login",
  },
  session: { strategy: "jwt" },
}
