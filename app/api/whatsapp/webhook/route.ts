import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"

// WhatsApp Cloud API webhook.
//
// Meta calls this endpoint for two things:
//   1. GET with hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
//      One-time handshake when you set the URL in App Dashboard → Webhooks.
//      We must echo hub.challenge as plain text if verify_token matches.
//   2. POST with message events (incoming messages, delivery statuses).
//      Signed with HMAC-SHA256 using your App Secret in X-Hub-Signature-256.
//
// Required env:
//   WHATSAPP_VERIFY_TOKEN   — arbitrary string, also entered in App Dashboard
//   WHATSAPP_APP_SECRET     — App Secret from Settings → Basic (for sig check)

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  if (!expected) {
    return NextResponse.json({ error: "verify_token_not_configured" }, { status: 500 })
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 })
}

function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false
  const provided = signatureHeader.slice("sha256=".length)
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex")
  const a = Buffer.from(provided, "hex")
  const b = Buffer.from(expected, "hex")
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

type WAStatus = { id: string; status: string; recipient_id: string; errors?: { code: number; title: string }[] }
type WAMessage = { from: string; id: string; type: string; text?: { body: string }; timestamp: string }

export async function POST(request: NextRequest) {
  const raw = await request.text()
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (appSecret) {
    const sig = request.headers.get("x-hub-signature-256")
    if (!verifySignature(raw, sig, appSecret)) {
      console.warn("[whatsapp-webhook] bad signature")
      return NextResponse.json({ error: "bad_signature" }, { status: 401 })
    }
  } else {
    console.warn("[whatsapp-webhook] WHATSAPP_APP_SECRET not set — accepting unsigned payload")
  }

  try {
    const body = JSON.parse(raw) as {
      entry?: {
        changes?: {
          value?: {
            messages?: WAMessage[]
            statuses?: WAStatus[]
          }
        }[]
      }[]
    }
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {}
        for (const msg of value.messages ?? []) {
          console.log("[whatsapp-webhook] message in:", {
            from: msg.from,
            type: msg.type,
            text: msg.text?.body,
          })
          // TODO: route incoming messages (e.g. /cancel, /code 123) here.
        }
        for (const st of value.statuses ?? []) {
          if (st.status === "failed" || st.errors?.length) {
            console.warn("[whatsapp-webhook] status:", st)
          } else {
            console.log("[whatsapp-webhook] status:", st.status, st.id)
          }
        }
      }
    }
  } catch (err) {
    console.error("[whatsapp-webhook] parse error:", err)
  }
  // Always 200 — Meta retries aggressively on non-2xx.
  return NextResponse.json({ ok: true })
}
