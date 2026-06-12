import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"

// Fixed-window rate limiter for PUBLIC endpoints, backed by a tiny Turso
// table so it works across serverless instances (in-memory counters don't).
//
// Why it exists (audit 2026-06-12): /api/otp/send could be used to spray
// WhatsApp codes at thousands of numbers (burning the Meta quota and the
// number's quality rating), /api/bookings could be spammed, and the mobile
// login had no brute-force brake.
//
// Semantics: count requests per (scope, subject) inside the current window.
// Fail-OPEN on DB errors — a broken limiter must never block real clients.

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number }

export async function rateLimit(opts: {
  scope: string
  /** Who is being limited — an IP, a phone, an email… */
  subject: string
  /** Max requests per window. */
  limit: number
  windowSec: number
}): Promise<RateLimitResult> {
  try {
    const windowStart = Math.floor(Date.now() / (opts.windowSec * 1000))
    const key = `${opts.scope}:${opts.subject}:${windowStart}`
    const expiresAt = new Date((windowStart + 1) * opts.windowSec * 1000)

    const row = await prisma.rateLimit.upsert({
      where: { id: key },
      create: { id: key, count: 1, expiresAt },
      update: { count: { increment: 1 } },
    })

    if (row.count > opts.limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) }
    }

    // Lazy purge: roughly once per ~50 allowed requests, drop expired rows.
    if (row.count === 1 && Math.abs(hashCode(key)) % 50 === 0) {
      prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {})
    }
    return { ok: true }
  } catch (err) {
    console.error("[rate-limit] check failed (failing open):", err)
    return { ok: true }
  }
}

/** Client IP for rate-limit subjects — Vercel sets x-forwarded-for. */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}
