import { NextRequest, NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { phoneTail } from "@/lib/membership"

// Name-first client autocomplete for the staff "Add a client" form (Yacinta /
// Sveta 11.07: regulars just say "book me for Tuesday as usual" - the coach
// shouldn't have to quest for their phone and email again; in Zenwel you type
// part of a name and the record pops up).
//
// Scope and privacy: staff of this studio only (admin OR trainer), at least 2
// typed characters, top 8 matches, and only clients who already booked HERE.
// This surfaces one client's saved contacts on demand - it never hands the
// trainer the whole client base (Sveta's explicit boundary).
export async function GET(request: NextRequest) {
  const ctx = await requireStaff()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim()
  if (q.length < 2) return NextResponse.json([])

  // Newest bookings first, so a client who changed phone/email surfaces with
  // their LATEST contacts. LIKE via `contains` is ASCII-case-insensitive.
  const rows = await prisma.booking.findMany({
    where: {
      slot: { studioId: ctx.studioId },
      clientName: { contains: q },
    },
    select: { clientName: true, clientPhone: true, clientEmail: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  // One suggestion per person (dedup by phone tail; nameless/phoneless rows out).
  const seen = new Set<string>()
  const out: { name: string; phone: string; email: string }[] = []
  for (const r of rows) {
    const tail = phoneTail(r.clientPhone)
    if (!r.clientName.trim() || tail.length < 6 || seen.has(tail)) continue
    seen.add(tail)
    out.push({ name: r.clientName.trim(), phone: r.clientPhone.replace(/\D/g, ""), email: r.clientEmail?.trim() ?? "" })
    if (out.length >= 8) break
  }
  return NextResponse.json(out)
}
