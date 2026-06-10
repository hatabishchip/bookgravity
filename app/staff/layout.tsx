"use client"

import { signOut, SessionProvider } from "next-auth/react"
import { LogOut } from "lucide-react"

// Cleaning/support staff layout. Deliberately minimal: a one-line top bar
// with the studio brand and a sign-out button. No nav, no inbox, no extras —
// the staff dashboard is read-only and the cleaner only ever needs the
// schedule view.
function StaffShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sand">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-bold text-brand tracking-tight truncate">
              Gravity Stretching
            </div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              Cleaning schedule
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 px-2.5 py-1.5 rounded-md hover:bg-gray-50 touch-manipulation"
            aria-label="Sign out"
          >
            <LogOut size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-5">{children}</main>
    </div>
  )
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <StaffShell>{children}</StaffShell>
    </SessionProvider>
  )
}
