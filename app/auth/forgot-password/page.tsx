"use client"

import { useState } from "react"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError("")
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      setSent(true)
    } else {
      const data = await res.json()
      setError(data.error ?? "Something went wrong")
    }
    setLoading(false)
  }

  return (
    <div className="h-[100svh] bg-gray-50 flex items-center justify-center p-4 overflow-hidden">
      <div className="bg-white rounded-2xl shadow-sm p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Reset password</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your email and we&apos;ll send a reset link</p>

        {sent ? (
          <div className="text-center">
            <div className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">✉️</span>
            </div>
            <p className="text-sm text-gray-700 font-medium mb-1">Check your email</p>
            <p className="text-sm text-gray-400 mb-4">A reset link has been sent to <strong>{email}</strong></p>
            <Link href="/login" className="text-sm text-brand hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand text-white py-3 rounded-xl text-sm font-medium hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
            <div className="text-center">
              <Link href="/login" className="text-sm text-gray-400 hover:text-gray-600">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
