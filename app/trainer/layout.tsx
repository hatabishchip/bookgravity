"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Calendar, BookOpen, LogOut, KeyRound, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SessionProvider } from "next-auth/react"

const navItems = [
  { href: "/trainer", label: "My Schedule", icon: Calendar },
  { href: "/trainer/bookings", label: "Bookings", icon: BookOpen },
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
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

function TrainerNav() {
  const pathname = usePathname()
  const [showChangePassword, setShowChangePassword] = useState(false)

  return (
    <>
      <aside className="w-64 bg-white border-r border-gray-100 flex flex-col min-h-screen">
        <div className="p-6 border-b border-gray-100">
          <h1 className="font-bold text-[#2C6E49] text-lg">Gravity Stretching</h1>
          <p className="text-xs text-gray-400 mt-0.5">Trainer Portal</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
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
          <button onClick={() => setShowChangePassword(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 w-full transition-colors">
            <KeyRound size={18} />
            Change Password
          </button>
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 w-full transition-colors">
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </>
  )
}

export default function TrainerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen bg-[#F5F4F0]">
        <TrainerNav />
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </SessionProvider>
  )
}
