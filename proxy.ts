import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  if (pathname.startsWith("/admin")) {
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url))
    }
  }

  if (pathname.startsWith("/trainer")) {
    if (!session || session.user.role !== "TRAINER") {
      return NextResponse.redirect(new URL("/login", req.url))
    }
  }
})

export const config = {
  matcher: ["/admin/:path*", "/trainer/:path*"],
}
