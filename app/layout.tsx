import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import OfflineBanner from "./_components/OfflineBanner"
import { prisma } from "@/lib/prisma"
import { getStudioIdBySubdomain } from "@/lib/studio"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export async function generateMetadata(): Promise<Metadata> {
  let studio: { name: string; slug: string } | null = null
  try {
    const studioId = await getStudioIdBySubdomain()
    studio = await prisma.studio.findUnique({
      where: { id: studioId },
      select: { name: true, slug: true },
    })
  } catch {
    // Subdomain lookup can fail at build time — fall back to defaults
  }

  const title = studio?.name ? `${studio.name} — Booking` : "Gravity Stretching Changgu"
  // Slug-suffixed URLs prevent cache collisions across subdomains
  const slug = studio?.slug ?? "default"
  const faviconUrl = `/api/favicon?s=${slug}`
  const appIconUrl = `/api/app-icon?s=${slug}`

  return {
    title,
    description: "Book your group stretching session",
    icons: {
      icon: faviconUrl,
      apple: appIconUrl,
    },
    appleWebApp: {
      capable: true,
      title: studio?.name ?? "Gravity Stretching",
      statusBarStyle: "default",
    },
    other: {
      "facebook-domain-verification": "clyp87431mdp6q9nj6nz1ashxbrycv",
    },
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2C6E49",
  // Tell iOS Safari (and Chrome Android) to shrink the *layout* viewport when
  // the soft keyboard appears, not just the visual viewport. This is what
  // makes `position: fixed inset-0` (and 100dvh) automatically size to the
  // visible area above the keyboard — without it, fixed modals on iOS render
  // at full-screen size with the keyboard covering the bottom and Safari then
  // scrolls inside, hiding the chat header and exposing the page underneath.
  interactiveWidget: "resizes-content",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full overflow-x-hidden`}>
      <body className="min-h-full bg-[#F5F4F0] font-sans antialiased overflow-x-hidden">
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
