"use client"

import { signOut } from "next-auth/react"

export function SignOutButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: `${window.location.origin}/login` })}
      className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
    >
      {children}
    </button>
  )
}
