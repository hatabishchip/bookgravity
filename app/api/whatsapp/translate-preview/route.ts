import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { translateAndDetect } from "@/lib/translate"
import { z } from "zod"

// Display-only translation for the agent-suggestion preview toggle (owner
// 22.07). The trainer can flip the suggestion card between English and Bahasa
// just to READ it - this endpoint only translates arbitrary text and returns
// it. It NEVER writes to the DB and NEVER sends anything: what actually gets
// sent to the client is the English draft (translated into the client's own
// language at send time by the messages route), independent of this preview.
const Body = z.object({
  text: z.string().min(1).max(4000),
  targetLang: z.string().min(2).max(5),
})

export async function POST(req: NextRequest) {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 })

  const { text, targetLang } = parsed.data
  const t = await translateAndDetect({ text, targetLang })
  // Fallback to the original text on any failure so the UI still shows something.
  const translated = t.ok && t.translated.trim().length > 0 ? t.translated : text
  return NextResponse.json({ translated })
}
