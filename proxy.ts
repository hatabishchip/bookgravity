import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

// Next.js 16 renamed middleware → proxy. This guards /admin, /trainer and
// /sadmin routes by role and bounces unauthenticated users to /login.
export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth
  const role = session?.user?.role

  if (pathname.startsWith("/sadmin")) {
    // /sadmin is the platform-owner panel. SUPER_ADMIN only.
    if (role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url))
    }
    return
  }

  if (pathname.startsWith("/admin")) {
    // Per-studio admin dashboard. ADMIN of any studio passes; SUPER_ADMIN
    // also passes (they own the whole platform and act as admin everywhere).
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url))
    }
    return
  }

  if (pathname.startsWith("/trainer")) {
    // Trainer dashboard. TRAINER only — admins have their own surface.
    if (role !== "TRAINER") {
      return NextResponse.redirect(new URL("/login", req.url))
    }
    return
  }
})

export const config = {
  matcher: ["/admin/:path*", "/trainer/:path*", "/sadmin/:path*"],
}
