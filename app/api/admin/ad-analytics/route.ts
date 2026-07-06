import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

// Ad analytics = the full paid-ad funnel for this studio, end to end:
//   Meta spend/impressions/clicks/conversations  (from the Graph API, optional)
//     -> ad leads   (WhatsAppConversation rows stamped with a CTWA referral)
//        -> bookings (a booking whose clientPhone matches an ad lead, made
//                     AFTER the ad click)
//           -> PAID bookings + estimated revenue.
// From those we derive cost-per-lead, cost-per-booking, cost-per-paying-client
// and ROAS. The DB side is exact; the Meta side is shown only when the ad token
// env is configured (page still renders the funnel without it).
//
// Attribution is FIRST-TOUCH and FORWARD-ONLY: only conversations whose first
// ad-referred message arrived after the capture went live carry an adSourceId.

// last-9-digit suffix — robust to +62 / 62 / 0 phone prefixes so an ad lead's
// WhatsApp number matches the same person's booking phone.
function suffix9(phone: string): string {
  return phone.replace(/\D/g, "").slice(-9)
}

type MetaInsights = {
  spend: number
  impressions: number
  clicks: number
  reach: number
  conversations: number // messaging_conversation_started_7d
} | null

async function fetchMeta(preset: string): Promise<MetaInsights> {
  const token = process.env.FB_ADS_TOKEN
  const account = process.env.FB_AD_ACCOUNT_ID // e.g. act_939706296099799
  const campaign = process.env.FB_ADS_CAMPAIGN_ID // optional: narrow to one campaign
  if (!token || (!account && !campaign)) return null
  const base = process.env.FB_GRAPH_BASE || "https://graph.facebook.com/v21.0"
  const node = campaign || account
  const url = `${base}/${node}/insights?date_preset=${encodeURIComponent(preset)}` +
    `&fields=spend,impressions,clicks,reach,actions&access_token=${token}`
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const json = await res.json()
    const row = json?.data?.[0]
    if (!row) return { spend: 0, impressions: 0, clicks: 0, reach: 0, conversations: 0 }
    const conv = (row.actions || []).find(
      (a: { action_type: string; value: string }) =>
        a.action_type === "onsite_conversion.messaging_conversation_started_7d",
    )
    return {
      spend: parseFloat(row.spend || "0"),
      impressions: parseInt(row.impressions || "0", 10),
      clicks: parseInt(row.clicks || "0", 10),
      reach: parseInt(row.reach || "0", 10),
      conversations: parseInt(conv?.value || "0", 10),
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const preset = searchParams.get("preset") ?? "maximum" // Meta date_preset

  const studio = await prisma.studio.findUnique({
    where: { id: ctx.studioId },
    select: { localPrice: true, membershipClassPrice: true },
  })
  const classValue = studio?.localPrice ?? studio?.membershipClassPrice ?? 200000

  // 1) Ad leads — conversations stamped with a CTWA referral for this studio.
  const adLeads = await prisma.whatsAppConversation.findMany({
    where: { studioId: ctx.studioId, adSourceId: { not: null } },
    select: {
      clientPhone: true,
      clientName: true,
      adSourceId: true,
      adHeadline: true,
      adReferralAt: true,
    },
    orderBy: { adReferralAt: "desc" },
  })

  // Map last-9-digit suffix -> earliest ad referral time for that person.
  const leadFirstTouch = new Map<string, Date>()
  for (const l of adLeads) {
    const s = suffix9(l.clientPhone)
    if (!s) continue
    const t = l.adReferralAt ?? new Date(0)
    const prev = leadFirstTouch.get(s)
    if (!prev || t < prev) leadFirstTouch.set(s, t)
  }

  // 2) Bookings for this studio from any ad-lead phone, made AT/AFTER the click.
  let bookings = 0
  let paid = 0
  let revenue = 0
  const attributedClients = new Set<string>()
  const payingClients = new Set<string>()
  if (leadFirstTouch.size > 0) {
    const earliest = new Date(
      Math.min(...[...leadFirstTouch.values()].map((d) => d.getTime())),
    )
    const rows = await prisma.booking.findMany({
      where: {
        slot: { studioId: ctx.studioId },
        createdAt: { gte: earliest },
        status: "CONFIRMED",
      },
      select: { clientPhone: true, paymentStatus: true, createdAt: true },
    })
    for (const b of rows) {
      const s = suffix9(b.clientPhone)
      const touch = leadFirstTouch.get(s)
      if (!touch) continue // this booking's phone is not an ad lead
      if (b.createdAt < touch) continue // booked before they clicked the ad
      bookings++
      attributedClients.add(s)
      if (b.paymentStatus === "PAID") {
        paid++
        payingClients.add(s)
        revenue += classValue
      }
    }
  }

  const meta = await fetchMeta(preset)
  const spend = meta?.spend ?? null
  const round = (n: number) => Math.round(n * 100) / 100

  return NextResponse.json({
    preset,
    currency: "USD",
    meta, // spend / impressions / clicks / reach / conversations (null if token not set)
    funnel: {
      // conversations Meta counts vs referrals we actually captured (forward-only)
      metaConversations: meta?.conversations ?? null,
      capturedAdLeads: adLeads.length,
      attributedClients: attributedClients.size,
      bookings,
      paidBookings: paid,
      payingClients: payingClients.size,
      estRevenue: revenue, // IDR (local class value * paid bookings) - estimate
      classValue,
    },
    cost:
      spend != null
        ? {
            perLead: adLeads.length ? round(spend / adLeads.length) : null,
            perBooking: bookings ? round(spend / bookings) : null,
            perPayingClient: paid ? round(spend / paid) : null,
          }
        : null,
    // ROAS needs spend in the same currency as revenue. Spend is USD, revenue is
    // IDR — we return both raw and let the UI convert with the studio's rate.
    generatedAt: new Date().toISOString(),
    leads: adLeads.slice(0, 100).map((l) => ({
      name: l.clientName,
      phone: l.clientPhone,
      adHeadline: l.adHeadline,
      at: l.adReferralAt,
      booked: attributedClients.has(suffix9(l.clientPhone)),
      paid: payingClients.has(suffix9(l.clientPhone)),
    })),
  })
}
