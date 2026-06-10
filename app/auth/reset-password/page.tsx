"use client"

import { useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/app/_components/ui/Button"
import { Input } from "@/app/_components/ui/Input"
import { Card } from "@/app/_components/ui/Card"

function ResetForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get("token") ?? ""
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords do not match"); return }
    if (password.length < 4) { setError("Password must be at least 4 characters"); return }
    setLoading(true); setError("")
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    })
    if (res.ok) {
      setDone(true)
      setTimeout(() => router.push("/login"), 2000)
    } else {
      const data = await res.json()
      setError(data.error ?? "Something went wrong")
    }
    setLoading(false)
  }

  if (!token) return (
    <div className="text-center">
      <p className="text-sm text-red-500 mb-4">Invalid reset link</p>
      <Link href="/auth/forgot-password" className="text-sm text-brand hover:underline">Request a new one</Link>
    </div>
  )

  return done ? (
    <div className="text-center">
      <p className="text-sm font-medium text-gray-700 mb-1">Password updated!</p>
      <p className="text-sm text-gray-400">Redirecting to sign in...</p>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        minLength={4}
      />
      <Input
        type="password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm new password"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <Button type="submit" disabled={loading} fullWidth>
        {loading ? "Saving..." : "Set new password"}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="h-[100svh] bg-gray-50 flex items-center justify-center p-4 overflow-hidden">
      <Card className="p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Set new password</h1>
        <p className="text-sm text-gray-500 mb-6">Choose a new password for your account</p>
        <Suspense>
          <ResetForm />
        </Suspense>
      </Card>
    </div>
  )
}
