import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/admin/login", req.url))
    }
  }

  if (pathname.startsWith("/trainer") && !pathname.startsWith("/trainer/login")) {
    if (!session || session.user.role !== "TRAINER") {
      return NextResponse.redirect(new URL("/trainer/login", req.url))
    }
  }
})

export const config = {
  matcher: ["/admin/:path*", "/trainer/:path*"],
}
