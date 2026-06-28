"use client"

import { useState, useEffect } from "react"
import { signOut, SessionProvider } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calendar, BookOpen, Users, UserRound, Package, LayoutDashboard, LogOut, Banknote, ArrowLeftRight, Settings, ExternalLink, X, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import FloatingInbox from "@/app/_components/FloatingInbox"
import WebPushManager from "@/app/_components/WebPushManager"

const navItems: { href: string; label: string; icon: React.ComponentType<{ size?: number }>; beta?: boolean }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/schedule", label: "Schedule", icon: Calendar },
  { href: "/admin/beta-schedule", label: "Schedule", icon: Calendar, beta: true },
  { href: "/admin/bookings", label: "Bookings", icon: BookOpen },
  { href: "/admin/clients", label: "Clients", icon: UserRound },
  { href: "/admin/trainers", label: "Trainers", icon: Users },
  { href: "/admin/services", label: "Services", icon: Package },
  { href: "/admin/salary", label: "Salary", icon: Banknote },
  { href: "/admin/cashflow", label: "Cash Flow", icon: ArrowLeftRight },
]

function SidebarContent({ onClose }: { onClose: () => void }) {
  const pathname = usePathname()
  const [studio, setStudio] = useState<{ name: string; slug: string; isDefault: boolean } | null>(null)
  // The just-tapped item lights up INSTANTLY (before the route resolves); the
  // mobile drawer closes a beat later so you actually see where you landed.
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => onClose(), 180)
    return () => clearTimeout(t)
  }, [pathname])

  useEffect(() => {
    fetch("/api/studio").then((r) => r.ok ? r.json() : null).then((d) => d && setStudio(d))
  }, [])

  const settingsActive = pathname === "/admin/settings" || pendingHref === "/admin/settings"

  return (
    <>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/10 flex items-center justify-between gap-2 flex-shrink-0">
        <h1 className="font-semibold text-gray-700 dark:text-gray-200 text-sm">Admin Panel</h1>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 dark:text-gray-200 rounded-lg flex-shrink-0"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Single scrollable region — nav + settings + sign out in one flow so
          Sign Out is always reachable even behind Android system navigation. */}
      <div className="flex-1 overflow-y-auto">
        <nav className="p-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon, beta }) => {
            const active = pathname === href || pendingHref === href
            return (
              <Link key={href} href={href}
                onClick={() => setPendingHref(href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.98]",
                  active
                    ? "bg-brand text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-50 active:bg-brand/10 active:text-brand dark:text-gray-300 dark:hover:bg-white/5 dark:active:bg-brand/20",
                )}>
                <Icon size={18} />
                <span className="flex-1">{label}</span>
                {beta && (
                  <span className={cn(
                    "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                    active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                  )}>
                    Beta
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="px-4 pb-4 space-y-1 border-t border-gray-100 dark:border-white/10 pt-4">
          <Link href={studio?.slug ? `/${studio.slug}` : "/"}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5">
            <ExternalLink size={18} />
            <span className="flex-1">Booking page</span>
          </Link>
          <Link href="/admin/settings"
            onClick={() => setPendingHref("/admin/settings")}
            aria-current={settingsActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.98]",
              settingsActive
                ? "bg-brand text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-50 active:bg-brand/10 active:text-brand dark:text-gray-300 dark:hover:bg-white/5 dark:active:bg-brand/20",
            )}>
            <Settings size={18} />
            Settings
          </Link>
          <button onClick={() => signOut({ callbackUrl: `${window.location.origin}/` })}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5 w-full">
            <LogOut size={18} />
            Sign Out
          </button>
          {/* Padding so Sign Out scrolls above Android system navigation bar. */}
          <div className="h-6" />
        </div>
      </div>
    </>
  )
}

function MobileTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname()
  const activeLabel = navItems.find((n) => n.href === pathname)?.label ?? "Admin"
  const [studio, setStudio] = useState<{ name: string } | null>(null)

  useEffect(() => {
    fetch("/api/studio").then((r) => r.ok ? r.json() : null).then((d) => d && setStudio(d))
  }, [])

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white dark:bg-[#12151b] border-b border-gray-100 dark:border-white/10 px-4 py-3 flex items-center gap-3">
      <button
        onClick={onMenuClick}
        className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 dark:text-gray-200 rounded-lg"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-brand dark:text-[#69b58f] text-sm truncate">
          {studio?.name || "Gravity Stretching"}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500">{activeLabel}</div>
      </div>
    </header>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)

  // Keep <html>.dark in sync with the saved admin theme. The anti-FOUC script
  // in the root layout sets it on the first paint (so no white flash on
  // refresh); this keeps it correct for client-side navigation into admin and
  // live theme toggles, and removes it when leaving admin so the public site
  // and trainer area stay light. Reads localStorage directly (not the laggy
  // hook state) so there's no flash on mount.
  useEffect(() => {
    const root = document.documentElement
    const apply = () => root.classList.toggle("dark", localStorage.getItem("admin-theme") === "dark")
    apply()
    window.addEventListener("admin-theme-change", apply)
    window.addEventListener("storage", apply)
    return () => {
      window.removeEventListener("admin-theme-change", apply)
      window.removeEventListener("storage", apply)
      root.classList.remove("dark")
    }
  }, [])

  return (
    <SessionProvider>
      <div className="flex min-h-screen bg-sand dark:bg-[#0c0f14]">
        <aside
          className={cn(
            "fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-100 flex flex-col transition-transform duration-200",
            "dark:bg-[#12151b] dark:border-white/10",
            "lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
            navOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <SidebarContent onClose={() => setNavOpen(false)} />
        </aside>

        {navOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setNavOpen(false)}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <MobileTopBar onMenuClick={() => setNavOpen(true)} />
          <main className="flex-1 p-4 lg:p-8 min-w-0 overflow-x-hidden">{children}</main>
        </div>
        <FloatingInbox role="ADMIN" />
        <WebPushManager />
      </div>
    </SessionProvider>
  )
}
