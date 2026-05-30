import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

// Mask a long secret to short tail for safe display in admin UI.
function maskToken(token: string | null | undefined): string | null {
  if (!token) return null
  if (token.length <= 12) return "•".repeat(token.length)
  return token.slice(0, 4) + "…" + token.slice(-4)
}

export async function GET() {
  const ctx = await requireSuperAdmin()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const studios = await prisma.studio.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { users: true, trainers: true, timeSlots: true, whatsappConversations: true } },
      // The login accounts that can reach this studio's /admin — its ADMIN(s)
      // plus the platform SUPER_ADMIN. Shown so the owner knows which login to
      // use / reset.
      users: {
        where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
        select: { id: true, email: true, role: true, initialPassword: true },
        orderBy: { role: "asc" },
      },
    },
  })
  // Strip the raw access token before sending to the client; expose a short
  // masked preview instead so the admin can see "is set / which key" without
  // ever loading the secret into the browser tab.
  return NextResponse.json(
    studios.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      isDefault: s.isDefault,
      logoUrl: s.logoUrl ? "✓" : null, // just a presence flag
      createdAt: s.createdAt,
      counts: s._count,
      emailsSentCount: s.emailsSentCount,
      admins: s.users.map((u) => ({ email: u.email, role: u.role, initialPassword: u.initialPassword })),
      whatsapp: {
        enabled: s.whatsappEnabled,
        phoneNumberId: s.whatsappPhoneNumberId,
        businessAccountId: s.whatsappBusinessAccountId,
        displayPhone: s.whatsappDisplayPhone,
        connectedAt: s.whatsappConnectedAt,
        accessTokenPreview: maskToken(s.whatsappAccessToken),
        hasAccessToken: !!s.whatsappAccessToken,
      },
    })),
  )
}

const NewStudioSchema = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/, "lowercase letters / digits / dashes only").min(2),
  adminEmail: z.string().email(),
})

// 4-digit starter password. The owner shares it once; the studio admin changes
// it on first sign-in (which clears initialPassword → shows "changed").
function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export async function POST(request: NextRequest) {
  const ctx = await requireSuperAdmin()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const body = await request.json()
    const data = NewStudioSchema.parse(body)

    // Uniqueness pre-checks (Studio.slug is unique, User.email is unique).
    const existingSlug = await prisma.studio.findUnique({ where: { slug: data.slug } })
    if (existingSlug) return NextResponse.json({ error: `Slug "${data.slug}" already in use` }, { status: 409 })
    const existingEmail = await prisma.user.findUnique({ where: { email: data.adminEmail } })
    if (existingEmail) return NextResponse.json({ error: `Email already in use by another account` }, { status: 409 })

    const pin = generatePin()
    const hash = await bcrypt.hash(pin, 10)
    const studio = await prisma.studio.create({
      data: {
        name: data.name,
        slug: data.slug,
        users: {
          create: { email: data.adminEmail, password: hash, role: "ADMIN", initialPassword: pin },
        },
      },
    })
    // Return the starter password once so the super-admin can share it.
    return NextResponse.json({ ...studio, adminEmail: data.adminEmail, initialPassword: pin }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Per-studio updates (rename, toggle WA, set WA creds, delete).
const PatchSchema = z.object({
  id: z.string(),
  name: z.string().min(2).optional(),
  whatsappEnabled: z.boolean().optional(),
  // WhatsApp credentials — null clears, string sets. Token is treated as a
  // secret: if null is passed both phoneNumberId + accessToken get wiped.
  whatsappPhoneNumberId: z.string().nullable().optional(),
  whatsappAccessToken: z.string().nullable().optional(),
  whatsappBusinessAccountId: z.string().nullable().optional(),
  whatsappDisplayPhone: z.string().nullable().optional(),
})

export async function PATCH(request: NextRequest) {
  const ctx = await requireSuperAdmin()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const body = await request.json()
    const { id, ...data } = PatchSchema.parse(body)

    // If admin is wiring a fresh WA connection, stamp `connectedAt`. If they
    // pass an explicit clear (token === null), wipe the timestamp.
    let connectedAtUpdate: { whatsappConnectedAt?: Date | null } = {}
    if (data.whatsappAccessToken === null && data.whatsappPhoneNumberId === null) {
      connectedAtUpdate = { whatsappConnectedAt: null }
    } else if (typeof data.whatsappAccessToken === "string" && data.whatsappAccessToken.length > 0) {
      connectedAtUpdate = { whatsappConnectedAt: new Date() }
    }

    const updated = await prisma.studio.update({
      where: { id },
      data: { ...data, ...connectedAtUpdate },
    })
    return NextResponse.json({
      ...updated,
      whatsappAccessToken: maskToken(updated.whatsappAccessToken),
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((e) => e.message).join("; ") }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
