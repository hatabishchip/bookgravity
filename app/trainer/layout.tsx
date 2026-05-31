"use client"

import { useState, useEffect } from "react"
import { signOut, SessionProvider } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calendar, BookOpen, Banknote, LogOut, KeyRound, X, Menu, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import FloatingInbox from "@/app/_components/FloatingInbox"

const navItems = [
  { href: "/trainer", label: "My Schedule", icon: Calendar },
  { href: "/trainer/bookings", label: "Bookings", icon: BookOpen },
  { href: "/trainer/salary", label: "Salary", icon: Banknote },
]

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.next !== form.confirm) { setError("Passwords do not match"); return }
    setLoading(true); setError("")
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
    })
    if (res.ok) { setDone(true) }
    else { const d = await res.json(); setError(d.error ?? "Error") }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Change Password</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        {done ? (
          <div className="text-center py-4">
            <p className="text-[#2C6E49] font-medium mb-1">Password updated!</p>
            <button onClick={onClose} className="mt-3 text-sm text-gray-400 hover:text-gray-600">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input type="password" required placeholder="Current password" value={form.current}
              onChange={(e) => setForm({ ...form, current: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]" />
            <input type="password" required placeholder="New password" minLength={4} value={form.next}
              onChange={(e) => setForm({ ...form, next: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]" />
            <input type="password" required placeholder="Confirm new password" value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]" />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-[#2C6E49] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60">
              {loading ? "Saving..." : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function SidebarContent({ onClose }: { onClose: () => void }) {
  const pathname = usePathname()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [studio, setStudio] = useState<{ name: string; slug?: string } | null>(null)

  useEffect(() => { onClose() }, [pathname])

  useEffect(() => {
    fetch("/api/studio").then((r) => r.ok ? r.json() : null).then((d) => d && setStudio(d))
  }, [])

  return (
    <>
      <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-bold text-[#2C6E49] text-lg leading-tight">
            {studio?.name || "Gravity Stretching"}
          </h1>
          <p className="text-xs text-gray-400 mt-1">Trainer Portal</p>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
              className={cn("flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                active ? "bg-[#2C6E49] text-white" : "text-gray-600 hover:bg-gray-50"
              )}>
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-100 space-y-1">
        {/* Open the studio's booking page in the SAME window — the session
            cookie rides along so the page shows you're signed in (trainer)
            with a way back, and you're never logged out. */}
        <Link href={studio?.slug ? `/${studio.slug}` : "/"}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <ExternalLink size={18} />
          Booking page
        </Link>
        <button onClick={() => setShowChangePassword(true)}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 w-full transition-colors">
          <KeyRound size={18} />
          Change Password
        </button>
        <button onClick={() => signOut({ callbackUrl: `${window.location.origin}/` })}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 w-full transition-colors">
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </>
  )
}

function formatIDR(amount: number) {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000
    return `${(m % 1 === 0 ? m.toString() : m.toFixed(1)).replace(/\.0$/, "")}M`
  }
  if (amount >= 1000) return `${Math.round(amount / 1000)}k`
  return Math.round(amount).toString()
}

function MobileTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname()
  const activeLabel = navItems.find((n) => n.href === pathname)?.label ?? "Trainer"
  const [salary, setSalary] = useState<{ total: number } | null>(null)
  const [studio, setStudio] = useState<{ name: string } | null>(null)

  useEffect(() => {
    fetch("/api/trainer/salary").then((r) => r.ok ? r.json() : null).then((d) => d && setSalary(d))
  }, [pathname])

  useEffect(() => {
    fetch("/api/studio").then((r) => r.ok ? r.json() : null).then((d) => d && setStudio(d))
  }, [])

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
      <button
        onClick={onMenuClick}
        className="p-2 hover:bg-gray-100 rounded-lg"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[#2C6E49] text-sm truncate">
          {studio?.name || "Gravity Stretching"}
        </div>
        <div className="text-xs text-gray-400">{activeLabel}</div>
      </div>
      {salary && (
        <Link href="/trainer/salary" className="text-right leading-tight hover:opacity-80">
          <div className="text-[9px] uppercase tracking-wider text-gray-400 font-medium">This month</div>
          <div className="text-sm font-semibold text-gray-700">Rp {formatIDR(salary.total)}</div>
        </Link>
      )}
    </header>
  )
}

export default function TrainerLayout({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <SessionProvider>
      <div className="flex min-h-screen bg-[#F5F4F0]">
        <aside
          className={cn(
            "fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-100 flex flex-col transition-transform duration-200",
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
          <main className="flex-1 p-4 lg:p-8 min-w-0 overflow-x-hidden pt-[72px] lg:pt-8">{children}</main>
        </div>
        <FloatingInbox role="TRAINER" />
      </div>
    </SessionProvider>
  )
}
