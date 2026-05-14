import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export const metadata: Metadata = {
  title: "Gravity Stretching Changgu",
  description: "Book your group stretching session in Changgu, Bali",
  other: {
    "facebook-domain-verification": "clyp87431mdp6q9nj6nz1ashxbrycv",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full overflow-x-hidden`}>
      <body className="min-h-full bg-[#F5F4F0] font-sans antialiased overflow-x-hidden">{children}</body>
    </html>
  )
}
