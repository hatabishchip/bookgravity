import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import OfflineBanner from "./_components/OfflineBanner"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export async function generateMetadata(): Promise<Metadata> {
  // Brand-level default for the apex (studio chooser) and any page that doesn't
  // set its own metadata. Per-studio pages (/canggu, /ubud) override the title
  // AND the favicon with their own. Here we keep it studio-neutral — title and
  // icon are the brand, so the root (and its Google / WhatsApp link preview)
  // never reads "Canggu" to an Ubud visitor.
  const description =
    "Gravity Stretching - studios worldwide. " +
    "See the live schedule, book a class in a few taps, and save your QR ticket."
  return {
    title: "Gravity Stretching",
    description,
    icons: {
      // Brand mark (figure in a white circle, no location word).
      icon: "/brand-favicon.png",
      apple: "/brand-favicon.png",
    },
    // Controls the link preview (WhatsApp / social) so it doesn't fall back to
    // page text or a single studio's name.
    openGraph: {
      type: "website",
      siteName: "Gravity Stretching",
      title: "Gravity Stretching",
      description,
      url: "https://www.bookgravity.com",
      images: [{ url: "/og-cover.png", width: 1200, height: 630, alt: "Gravity Stretching" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Gravity Stretching",
      description,
      images: ["/og-cover.png"],
    },
    appleWebApp: {
      capable: true,
      title: "Gravity Stretching",
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
    <html lang="en" suppressHydrationWarning className={`${geist.variable} h-full overflow-x-hidden`}>
      <body className="min-h-full bg-[#F5F4F0] dark:bg-[#0c0f14] font-sans antialiased overflow-x-hidden">
        {/* Anti-FOUC: the admin dark theme is stored in localStorage and applied
            client-side. Without this, a dark-mode admin sees a white flash on
            every refresh (light first paint → JS flips to dark). This runs
            synchronously before the body paints and sets `.dark` on <html> so
            the very first frame is already dark. Scoped to /admin so the public
            site and trainer area stay light. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(location.pathname.indexOf('/admin')===0&&localStorage.getItem('admin-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();",
          }}
        />
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
