import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { ShieldCheck, LogOut } from "lucide-react"
import { SignOutButton } from "./SignOutButton"

// Server-side gate. Anyone who isn't a SUPER_ADMIN never sees this surface.
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "SUPER_ADMIN") redirect("/admin")

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={18} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <Link href="/super-admin" className="font-bold text-base block leading-tight">Super Admin</Link>
              <div className="text-xs text-slate-400 truncate">{session.user.email}</div>
            </div>
          </div>
          <SignOutButton>
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign out</span>
          </SignOutButton>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
