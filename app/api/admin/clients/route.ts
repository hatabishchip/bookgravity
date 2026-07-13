import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { phoneTail } from "@/lib/membership"
import { elog } from "@/lib/elog"

// GET /api/admin/clients
//
// The studio's client directory, derived from ALL bookings — including
// CANCELLED ones, on purpose: when an admin removes a client from a class
// (e.g. to reschedule) the booking is only marked cancelled, so the client's
// name/phone/email must still be findable here instead of being "lost".
//
// Clients are grouped by the last-10-digits of their phone (stored formats
// vary: "+62 821-4554-6405" vs "+6282145546405"), newest booking wins for the
// displayed name/phone format, newest non-empty email wins for email.
export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const bookings = await prisma.booking.findMany({
    where: { slot: { studioId: ctx.studioId } },
    select: {
      clientName: true,
      clientPhone: true,
      clientEmail: true,
      status: true,
      createdAt: true,
      slot: { select: { date: true, startTime: true } },
    },
    orderBy: { createdAt: "desc" }, // newest first → first hit per group wins
  })

  type Client = {
    name: string
    phone: string
    email: string | null
    confirmedCount: number
    cancelledCount: number
    /** Most recent class date this client was ever on (any status). */
    lastClassDate: string | null
    /** When the most recent booking was made. */
    lastBookedAt: string
  }

  const byTail = new Map<string, Client>()
  for (const b of bookings) {
    const tail = phoneTail(b.clientPhone) || b.clientPhone
    // Party bookings are stored as "Name (2/6)" — show the bare name.
    const cleanName = b.clientName.replace(/\s*\(\d+\/\d+\)$/, "").trim()
    let c = byTail.get(tail)
    if (!c) {
      c = {
        name: cleanName,
        phone: b.clientPhone,
        email: null,
        confirmedCount: 0,
        cancelledCount: 0,
        lastClassDate: null,
        lastBookedAt: b.createdAt.toISOString(),
      }
      byTail.set(tail, c)
    }
    if (!c.email && b.clientEmail) c.email = b.clientEmail
    if (b.status === "CANCELLED") c.cancelledCount += 1
    else c.confirmedCount += 1
    if (!c.lastClassDate || b.slot.date > c.lastClassDate) c.lastClassDate = b.slot.date
  }

  const clients = [...byTail.values()].sort((a, b) =>
    (b.lastClassDate ?? "").localeCompare(a.lastClassDate ?? ""),
  )
  return NextResponse.json(clients)
}

// PATCH /api/admin/clients
//
// Correct a client's saved contact details (phone / name / email). Rare,
// admin-only. A client is identified by their phone, and that phone is the
// join key denormalized across Booking, WhatsAppConversation, Membership and
// BookingOtp - so a phone change must re-key EVERY one of those in a single
// transaction (exactly the manual fix we used to do by hand). Phones are stored
// digits-only since the 2026-06 normalization, so we match on the digit string.
export async function PATCH(req: Request) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { currentPhone?: string; newPhone?: string; newName?: string; newEmail?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const currDigits = String(body.currentPhone ?? "").replace(/\D/g, "")
  if (currDigits.length < 7) {
    return NextResponse.json({ error: "Invalid current phone" }, { status: 400 })
  }

  const wantPhone = body.newPhone != null && String(body.newPhone).trim() !== ""
  const newDigits = wantPhone ? String(body.newPhone).replace(/\D/g, "") : currDigits
  if (wantPhone && (newDigits.length < 7 || newDigits.length > 15)) {
    return NextResponse.json({ error: "New phone must be 7-15 digits" }, { status: 400 })
  }
  const newName = body.newName != null ? String(body.newName).trim() : null
  const newEmail = body.newEmail != null ? String(body.newEmail).trim() : null
  const phoneChanged = newDigits !== currDigits

  if (!phoneChanged && newName == null && newEmail == null) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 })
  }

  // Phones are digits-only since the 2026-06 normalization, but match
  // digit-EQUIVALENT rows (exact OR same tail-10 whose digits equal the target)
  // as insurance against any write path that ever stores a formatted phone.
  // Tail-10 alone is NOT enough: two numbers can share a tail and differ in
  // country code, so every tail candidate is re-checked on full digits.
  const digitsOf = (p: string) => p.replace(/\D/g, "")
  const currTail = phoneTail(currDigits) || currDigits
  const sameClient = { OR: [{ clientPhone: currDigits }, { clientPhone: { endsWith: currTail } }] }

  // Never silently merge into a DIFFERENT existing client's number.
  if (phoneChanged) {
    const newTail = phoneTail(newDigits) || newDigits
    const clashWhere = { OR: [{ clientPhone: newDigits }, { clientPhone: { endsWith: newTail } }] }
    const candidates = [
      ...(await prisma.booking.findMany({ where: clashWhere, select: { clientPhone: true } })),
      ...(await prisma.whatsAppConversation.findMany({ where: clashWhere, select: { clientPhone: true } })),
      ...(await prisma.membership.findMany({ where: clashWhere, select: { clientPhone: true } })),
    ]
    const clash = candidates.some(
      (c) => digitsOf(c.clientPhone) === newDigits && digitsOf(c.clientPhone) !== currDigits,
    )
    if (clash) {
      return NextResponse.json(
        { error: "That number already belongs to another client - merging is not supported." },
        { status: 409 },
      )
    }
  }

  // Keep the party-booking suffix ("(2/6)") when renaming.
  const renamed = (name: string | null): string | null => {
    if (newName == null) return name
    const suffix = name?.match(/\s*\(\d+\/\d+\)\s*$/)?.[0]?.trim()
    return suffix ? `${newName} ${suffix}` : newName
  }

  const summary = await prisma.$transaction(async (tx) => {
    const s: { bookings: number; conversations: number; memberships: number; otp: number } = {
      bookings: 0,
      conversations: 0,
      memberships: 0,
      otp: 0,
    }

    const bookings = (
      await tx.booking.findMany({ where: sameClient, select: { id: true, clientName: true, clientPhone: true } })
    ).filter((b) => digitsOf(b.clientPhone) === currDigits)
    for (const b of bookings) {
      await tx.booking.update({
        where: { id: b.id },
        data: {
          ...(phoneChanged ? { clientPhone: newDigits } : {}),
          ...(newName != null ? { clientName: renamed(b.clientName) ?? b.clientName } : {}),
          ...(newEmail != null ? { clientEmail: newEmail } : {}),
        },
      })
    }
    s.bookings = bookings.length

    if (phoneChanged || newName != null) {
      const convos = (
        await tx.whatsAppConversation.findMany({ where: sameClient, select: { id: true, clientPhone: true } })
      ).filter((c) => digitsOf(c.clientPhone) === currDigits)
      for (const c of convos) {
        await tx.whatsAppConversation.update({
          where: { id: c.id },
          data: {
            ...(phoneChanged ? { clientPhone: newDigits } : {}),
            ...(newName != null ? { clientName: newName } : {}),
          },
        })
      }
      s.conversations = convos.length

      const mems = (
        await tx.membership.findMany({ where: sameClient, select: { id: true, clientPhone: true } })
      ).filter((m) => digitsOf(m.clientPhone) === currDigits)
      for (const m of mems) {
        await tx.membership.update({
          where: { id: m.id },
          data: {
            ...(phoneChanged ? { clientPhone: newDigits } : {}),
            ...(newName != null ? { clientName: newName } : {}),
          },
        })
      }
      s.memberships = mems.length
    }

    if (phoneChanged) {
      const otps = (
        await tx.bookingOtp.findMany({
          where: { OR: [{ phone: currDigits }, { phone: { endsWith: currTail } }] },
          select: { id: true, phone: true },
        })
      ).filter((o) => digitsOf(o.phone) === currDigits)
      for (const o of otps) {
        await tx.bookingOtp.update({ where: { id: o.id }, data: { phone: newDigits } })
      }
      s.otp = otps.length
    }

    return s
  })

  // Audit trail: client edits are rare and touch the identity key, so record
  // who changed what (before -> after) in the EventLog.
  void elog("client:edit", "admin edited client contact", {
    by: ctx.userId,
    studioId: ctx.studioId,
    fromPhone: currDigits,
    ...(phoneChanged ? { toPhone: newDigits } : {}),
    ...(newName != null ? { toName: newName } : {}),
    ...(newEmail != null ? { toEmail: newEmail } : {}),
    ...summary,
  })

  return NextResponse.json({ ok: true, newPhone: newDigits, ...summary })
}
