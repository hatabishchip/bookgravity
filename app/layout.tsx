import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import OfflineBanner from "./_components/OfflineBanner"
import VersionWatcher from "./_components/VersionWatcher"

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
    // Resolves relative URLs (OG images, canonical) to absolute. Without it,
    // Google/social can't build absolute preview-image or canonical URLs.
    metadataBase: new URL("https://bookgravity.com"),
    title: {
      default: "Gravity Stretching — book a stretching class",
      template: "%s · Gravity Stretching",
    },
    description,
    alternates: { canonical: "/" },
    keywords: [
      "gravity stretching",
      "spinal decompression",
      "stretching studio",
      "stretching class",
      "stretching Bali",
      "stretching Canggu",
      "stretching Ubud",
      "stretching Almaty",
      "растяжка алматы",
      "book stretching class",
      "flexibility training",
    ],
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
      title: "Gravity Stretching — book a stretching class",
      description,
      url: "https://bookgravity.com",
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
      <body className="min-h-full bg-sand dark:bg-[#0c0f14] font-sans antialiased overflow-x-hidden">
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
        {/* SELF-HEAL (Sveta's white screen, 10.07): when a cached HTML points
            at chunks a newer deploy deleted, NOTHING runs - not even
            VersionWatcher - and the user stares at a blank page until someone
            tells them to clear the cache. This dependency-free script catches
            failed /_next/ assets, chunk-load rejections and a missed boot
            beacon (window.__GS_BOOTED, set by VersionWatcher), then clears
            CacheStorage + service workers and reloads with a cache-busting
            query. Two attempts per build, then it stops (no reload loops).
            Inside the native app it also posts the "web-alive" handshake the
            shell's watchdog waits for. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
var B=${JSON.stringify(process.env.NEXT_PUBLIC_BUILD_ID || "dev")},K="gs-heal-"+B,healing=false,told=false;
function report(m){try{var p=JSON.stringify({message:m,kind:"recovery",platform:"web",appVersion:B,stack:location.pathname});
if(navigator.sendBeacon){navigator.sendBeacon("/api/native/log-crash",new Blob([p],{type:"application/json"}))}}catch(e){}}
function heal(reason){try{
if(healing)return;
/* The old cap was two attempts per build FOREVER, and hitting it returned in
   silence: the device stayed white with no telemetry at all, which is exactly
   how Sveta's app looked on 24.07 (white pages, zero beacons for two days).
   The counter now carries a timestamp and decays, so a device can never be
   bricked permanently, and a suppressed heal still reports once - a stuck
   client shows up in the log instead of going quiet. */
var QUIET=1800000,raw=localStorage.getItem(K)||"",parts=raw.split(":"),
n=parseInt(parts[0]||"0",10)||0,t=parseInt(parts[1]||"0",10)||0,now=Date.now();
if(!t||now-t>QUIET)n=0;
if(n>=2){if(!told){told=true;report("web-self-heal SUPPRESSED (cap reached, still broken): "+reason)}return}
healing=true;localStorage.setItem(K,(n+1)+":"+now);report("web-self-heal: "+reason);
var done=function(){var u=location.pathname+location.search;u+=(u.indexOf("?")>=0?"&":"?")+"gsheal="+(n+1);location.replace(u)};
var ps=[];
if(window.caches&&caches.keys){ps.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))}))}
if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){ps.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister()}))}))}
Promise.all(ps).then(done,done);setTimeout(done,3000);
}catch(e){try{location.reload()}catch(_){}}}
window.addEventListener("error",function(ev){var t=ev&&ev.target;
if(t&&(t.tagName==="SCRIPT"||t.tagName==="LINK")){var s=(t.src||t.href||"");
if(s.indexOf("/_next/")>=0){heal("asset "+s.split("/").pop());return}}
var m=String((ev&&ev.message)||"");
if(/ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(m))heal("chunk "+m.slice(0,60))},true);
window.addEventListener("unhandledrejection",function(ev){
var m=String((ev&&ev.reason&&(ev.reason.message||ev.reason))||"");
if(/ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(m))heal("chunk "+m.slice(0,60))});
function booted(){try{localStorage.removeItem(K)}catch(e){}
if(window.__GS_NATIVE__&&window.ReactNativeWebView){try{window.ReactNativeWebView.postMessage(JSON.stringify({type:"web-alive"}))}catch(e){}}}
var tries=0;function checkBoot(){if(window.__GS_BOOTED){booted();return}
tries++;if(tries>=3){if(document.readyState!=="loading")heal("boot-timeout");return}
setTimeout(checkBoot,5000)}
setTimeout(checkBoot,6000);
}catch(e){}})();`,
          }}
        />
        <OfflineBanner />
        <VersionWatcher />
        {children}
      </body>
    </html>
  )
}
