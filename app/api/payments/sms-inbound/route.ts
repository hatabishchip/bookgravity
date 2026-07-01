import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parseBankSms } from "@/lib/bank-sms"

// Inbound bank-SMS webhook. An Android SMS forwarder on the phone that holds the
// studio's bank SIM POSTs every incoming SMS here; we parse the BRI QRIS ones
// into BankPayment rows for an admin to link to a booking.
//
// AUTH: a single shared secret SMS_INBOUND_TOKEN, passed however the forwarder
// app can manage it - `?token=`, `x-sms-token` header, or `Authorization:
// Bearer`. Fails closed when the env var is unset.
//
// BODY: forwarder apps differ, so we accept JSON, form-urlencoded, or a raw
// text/plain body that IS the SMS. Studio is resolved from `?studio=<slug>`,
// a `studio` body field, SMS_INBOUND_DEFAULT_STUDIO, or the default studio.

export const maxDuration = 15

function tokenOk(req: NextRequest): boolean {
  const secret = process.env.SMS_INBOUND_TOKEN
  if (!secret) return false // fail closed when unconfigured
  const provided =
    req.nextUrl.searchParams.get("token") ||
    req.headers.get("x-sms-token") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
  return provided === secret
}

type Extracted = { text: string; sender: string | null; studioSlug: string }

async function extractPayload(req: NextRequest): Promise<Extracted> {
  const qStudio = req.nextUrl.searchParams.get("studio") || ""
  // Some forwarders can only do GET-style query params even on POST.
  const qText = req.nextUrl.searchParams.get("text") || req.nextUrl.searchParams.get("message") || ""
  const ctype = (req.headers.get("content-type") || "").toLowerCase()
  const raw = await req.text()

  let text = ""
  let sender: string | null = null
  let studioSlug = qStudio

  if (ctype.includes("application/json")) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>
      const pick = (...k: string[]) => k.map((x) => j[x]).find((v) => typeof v === "string") as string | undefined
      text = pick("text", "message", "msg", "body", "content", "sms") || ""
      sender = pick("from", "sender", "address", "phone") || null
      studioSlug = studioSlug || pick("studio", "slug") || ""
    } catch {
      // Malformed JSON - fall back to treating the body as raw text below.
    }
  } else if (ctype.includes("application/x-www-form-urlencoded")) {
    const p = new URLSearchParams(raw)
    text = p.get("text") || p.get("message") || p.get("msg") || p.get("body") || p.get("content") || p.get("sms") || ""
    sender = p.get("from") || p.get("sender") || p.get("address") || p.get("phone") || null
    studioSlug = studioSlug || p.get("studio") || p.get("slug") || ""
  }

  // Raw body (text/plain or unrecognised content-type) or query fallback.
  if (!text) text = raw || qText

  return { text: text.trim(), sender, studioSlug }
}

async function resolveStudio(slug: string) {
  const wanted = slug || process.env.SMS_INBOUND_DEFAULT_STUDIO || ""
  if (wanted) {
    const s = await prisma.studio.findUnique({ where: { slug: wanted }, select: { id: true, slug: true } })
    if (s) return s
  }
  return prisma.studio.findFirst({ where: { isDefault: true }, select: { id: true, slug: true } })
}

export async function POST(req: NextRequest) {
  if (!process.env.SMS_INBOUND_TOKEN) {
    return NextResponse.json({ error: "not configured" }, { status: 503 })
  }
  if (!tokenOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { text, sender, studioSlug } = await extractPayload(req)
  if (!text) return NextResponse.json({ error: "empty body" }, { status: 400 })

  const studio = await resolveStudio(studioSlug)
  if (!studio) return NextResponse.json({ error: "studio not found" }, { status: 404 })

  const parsed = parseBankSms(text)
  // Not a recognised incoming-payment SMS (balance info, OTP, promo). Ack with
  // 200 so the forwarder marks it delivered and does not retry-spam us.
  if (!parsed) return NextResponse.json({ ignored: true }, { status: 200 })

  // Idempotency: a re-forwarded SMS must not create a second row.
  const dupWhere = parsed.reference
    ? { studioId: studio.id, reference: parsed.reference }
    : { studioId: studio.id, amount: parsed.amount, paidAt: parsed.paidAt, rawText: text }
  const existing = await prisma.bankPayment.findFirst({ where: dupWhere, select: { id: true } })
  if (existing) return NextResponse.json({ duplicate: true, id: existing.id }, { status: 200 })

  try {
    const row = await prisma.bankPayment.create({
      data: {
        studioId: studio.id,
        amount: parsed.amount,
        reference: parsed.reference,
        channel: parsed.channel,
        sender,
        rawText: text,
        paidAt: parsed.paidAt,
      },
      select: { id: true },
    })
    return NextResponse.json(
      { ok: true, id: row.id, amount: parsed.amount, reference: parsed.reference, studio: studio.slug },
      { status: 200 },
    )
  } catch (err) {
    // Unique (studioId, reference) race - another request won; treat as dupe.
    const msg = err instanceof Error ? err.message : String(err)
    if (/unique|constraint/i.test(msg)) {
      const row = await prisma.bankPayment.findFirst({ where: dupWhere, select: { id: true } })
      return NextResponse.json({ duplicate: true, id: row?.id ?? null }, { status: 200 })
    }
    console.error("[sms-inbound] insert failed:", msg)
    return NextResponse.json({ error: "insert failed" }, { status: 500 })
  }
}

// Token-gated health check so the forwarder / owner can confirm connectivity.
export async function GET(req: NextRequest) {
  if (!tokenOk(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json({ ok: true, service: "sms-inbound", ready: true })
}
