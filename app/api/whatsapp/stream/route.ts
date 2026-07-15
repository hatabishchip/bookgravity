// GET /api/whatsapp/stream - Server-Sent Events for the inbox (owner 15.07,
// "связь без дёрганья: только при изменениях").
//
// The browser holds ONE open connection here and makes zero repeat requests.
// Server-side we cheaply poll a per-studio change signature (conversation
// count + latest updatedAt - updatedAt bumps on every new message / unread
// change) every couple of seconds and push a `changed` event only when it
// actually moves. The client then does a targeted refresh.
//
// Serverless reality: a function can't stay open forever, so the stream
// self-closes just under Vercel's duration cap and the browser's EventSource
// reconnects automatically. A thin 60s client poll remains as a safety net if
// SSE is ever blocked by a proxy.
import { requireAuth } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const POLL_MS = 2000 // how often we check the signature server-side
const PING_MS = 15000 // keep-alive comment so proxies don't drop the stream
const LIFETIME_MS = 50000 // self-close before maxDuration; client reconnects

async function studioSignature(studioId: string): Promise<string> {
  const rows = await prisma.whatsAppConversation.findMany({
    where: { studioId },
    select: { updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 1,
  })
  const count = await prisma.whatsAppConversation.count({ where: { studioId } })
  const latest = rows[0]?.updatedAt?.getTime() ?? 0
  return `${count}:${latest}`
}

export async function GET() {
  const ctx = await requireAuth()
  if (!ctx) return new Response("Unauthorized", { status: 401 })
  const studioId = ctx.studioId

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(chunk)) } catch { closed = true }
      }

      // Initial hello so the client flips to "connected" immediately.
      send(`retry: 3000\n`)
      send(`event: ready\ndata: 1\n\n`)

      let lastSig = await studioSignature(studioId).catch(() => "")
      const started = Date.now()
      let lastPing = started

      while (!closed && Date.now() - started < LIFETIME_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS))
        if (closed) break
        try {
          const sig = await studioSignature(studioId)
          if (sig !== lastSig) {
            lastSig = sig
            send(`event: changed\ndata: ${sig}\n\n`)
          }
        } catch {
          // transient DB hiccup: keep the stream, try again next tick
        }
        if (Date.now() - lastPing > PING_MS) {
          lastPing = Date.now()
          send(`: ping\n\n`)
        }
      }
      if (!closed) { try { controller.close() } catch {} }
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
