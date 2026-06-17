import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { setWhatsAppProfilePictureFromDataUrl } from "@/lib/whatsapp-cloud"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { googleConfigured } from "@/lib/google-calendar"

const MAX_DATA_URL_LEN = 1_500_000 // ~1MB of base64 = ~750KB of real image
const MAX_COVER_URL_LEN = 3_500_000 // cover photos are larger (full-bleed)

// Languages we offer in the inbox dropdown. Two-letter ISO 639-1 lowercase.
// Add codes here as we grow; the translation lib accepts any 2-letter code
// already, this list is purely about constraining what admins can pick in
// the UI.
const SUPPORTED_INBOX_LANGS = ["en", "ru", "id", "es", "it", "fr", "de"] as const

const StudioUpdateSchema = z.object({
  // Studio name is intentionally NOT editable here — it's managed only by the
  // super-admin in /sadmin. Regular admins can view it but not change it.
  logoUrl: z.string().max(MAX_DATA_URL_LEN).nullable().optional(),
  faviconUrl: z.string().max(MAX_DATA_URL_LEN).nullable().optional(),
  coverUrl: z.string().max(MAX_COVER_URL_LEN).nullable().optional(),
  // Maps/location link shown in the client's WhatsApp confirmation. Empty → null.
  locationUrl: z.string().trim().max(2000).nullable().optional(),
  // Admin's WhatsApp number for booking alerts. Empty → null.
  bookingAlertWhatsapp: z.string().trim().max(40).nullable().optional(),
  groupPrice: z.number().min(0).optional(),
  kidsPrice: z.number().min(0).optional(),
  privatePrice: z.number().min(0).optional(),
  // Optional ISO 639-1 lowercase code, or null to turn translation off.
  inboxLanguage: z.enum(SUPPORTED_INBOX_LANGS).nullable().optional(),
  // Anti-spam: require a WhatsApp one-time code before a public booking.
  requireBookingOtp: z.boolean().optional(),
  // Booking Confirmation → Email channel toggle.
  confirmEmail: z.boolean().optional(),
  // Email a copy of inbound WhatsApp messages to the admin.
  emailAdminWaCopy: z.boolean().optional(),
  // Per-role Notifications toggles.
  emailClientBooking: z.boolean().optional(),
  emailAdminBooking: z.boolean().optional(),
  remindTomorrow: z.boolean().optional(),
  remindToday: z.boolean().optional(),
  notifyAdminWhatsapp: z.boolean().optional(),
  // Round-robin auto-assignment of incoming WhatsApp leads to trainers.
  autoAssignLeads: z.boolean().optional(),
})

const STUDIO_SELECT = {
  id: true,
  name: true,
  slug: true,
  country: true,
  logoUrl: true,
  faviconUrl: true,
  coverUrl: true,
  locationUrl: true,
  bookingAlertWhatsapp: true,
  isDefault: true,
  groupPrice: true,
  kidsPrice: true,
  privatePrice: true,
  inboxLanguage: true,
  whatsappEnabled: true,
  autoAssignLeads: true,
  requireBookingOtp: true,
  confirmEmail: true,
  emailAdminWaCopy: true,
  emailClientBooking: true,
  emailAdminBooking: true,
  remindTomorrow: true,
  remindToday: true,
  notifyAdminWhatsapp: true,
  // WhatsApp self-onboarding fields surfaced to /admin/settings so the
  // BookingAlertCard can render the right state (disabled / form / code
  // input / active). Token + WABA ID stay out of this select — they're
  // super-admin only.
  whatsappOnboardingEnabled: true,
  whatsappPhoneNumberId: true,
  whatsappDisplayPhone: true,
  whatsappRequestPhoneNumberId: true,
  whatsappRequestDisplayPhone: true,
  whatsappRequestStatus: true,
  whatsappRequestNote: true,
  // Google Calendar — connection display only (refresh token never leaves the
  // server).
  googleEmail: true,
  googleConnectedAt: true,
} as const

export async function GET() {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: STUDIO_SELECT,
  })
  if (!studio) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Whether THIS admin still has the auto-generated starter password (not yet
  // changed to their own). Drives the Settings "Change password" card: show
  // the form by default until they pick their own, then collapse to a pencil.
  const me = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { initialPassword: true },
  })
  return NextResponse.json({
    ...studio,
    usingInitialPassword: !!me?.initialPassword,
    // Whether the platform Google OAuth app is configured (env). Drives the
    // Settings card between "Connect" and "not available yet".
    googleConfigured: googleConfigured(),
  })
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  const parsed = StudioUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 })
  }

  const studio = await prisma.studio.update({
    where: { id: ctx.studioId },
    data: parsed.data,
    select: STUDIO_SELECT,
  })

  // Auto-sync the studio logo to the WhatsApp Business profile picture
  // whenever the admin uploads / replaces it. Fire-and-forget so a slow
  // Meta API call doesn't block the admin save.
  if (parsed.data.logoUrl && parsed.data.logoUrl.startsWith("data:")) {
    void (async () => {
      try {
        if (!(await isStudioWhatsAppEnabled(ctx.studioId))) return
        const r = await setWhatsAppProfilePictureFromDataUrl(parsed.data.logoUrl as string)
        if (!r.ok) {
          console.warn("[admin/studio] WA profile picture sync failed:", r.error)
        } else {
          console.log("[admin/studio] WA profile picture synced")
        }
      } catch (err) {
        console.error("[admin/studio] WA profile picture sync exception:", err)
      }
    })()
  }

  return NextResponse.json(studio)
}
