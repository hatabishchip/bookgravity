"use client"

import { useState, useEffect, useCallback } from "react"
import { Megaphone, MessageSquare, CalendarCheck, Wallet, TrendingUp } from "lucide-react"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { useT, useLocale } from "@/app/_components/LocaleProvider"

type Meta = {
  spend: number
  impressions: number
  clicks: number
  reach: number
  conversations: number
} | null

type Lead = {
  name: string | null
  phone: string
  adHeadline: string | null
  at: string | null
  booked: boolean
  paid: boolean
}

type Data = {
  preset: string
  currency: string
  meta: Meta
  funnel: {
    metaConversations: number | null
    capturedAdLeads: number
    attributedClients: number
    bookings: number
    paidBookings: number
    payingClients: number
    estRevenue: number
    classValue: number
  }
  cost: { perLead: number | null; perBooking: number | null; perPayingClient: number | null } | null
  generatedAt: string
  leads: Lead[]
}

const usd = (n: number | null | undefined) => (n == null ? "-" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const idr = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID")
const num = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("en-US"))

const PRESETS = [
  { key: "maximum", label: "All time" },
  { key: "last_30d", label: "30 days" },
  { key: "last_7d", label: "7 days" },
]

export default function AdAnalyticsPage() {
  const t = useT()
  const { dateLocale } = useLocale()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState("maximum")

  const load = useCallback(async (p: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/ad-analytics?preset=${p}`, { cache: "no-store" })
      setData(res.ok ? await res.json() : null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(preset)
  }, [preset, load])

  const f = data?.funnel
  const m = data?.meta

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Megaphone size={20} /> {t("Ads - ROI")}
        </h1>
        <div className="flex flex-wrap gap-1 text-sm">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={
                "px-3 py-1 rounded-full border " +
                (preset === p.key ? "bg-black text-white border-black" : "border-gray-300 text-gray-600")
              }
            >
              {t(p.label)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        {t("Full paid-ads funnel: Meta impressions -> conversations -> bookings -> payment. Attribution by CTWA tag, first-touch, forward-only (older leads are not tagged). Spend in USD, revenue in IDR.")}
      </p>

      {loading ? (
        <div className="py-20 flex justify-center"><PetalSpinner /></div>
      ) : !data ? (
        <div className="py-20 text-center text-gray-500">{t("No access or failed to load.")}</div>
      ) : (
        <>
          {/* Funnel row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Card icon={<Megaphone size={16} />} label={t("Spend (Meta)")} value={m ? usd(m.spend) : t("no token")}
              sub={m ? t("{n} impressions", { n: num(m.impressions) }) : t("Meta not connected")} />
            <Card icon={<MessageSquare size={16} />} label={t("Conversations")}
              value={num(m?.conversations ?? f?.capturedAdLeads ?? 0)}
              sub={m ? t("tagged by us: {n}", { n: f?.capturedAdLeads ?? 0 }) : t("tagged: {n}", { n: f?.capturedAdLeads ?? 0 })} />
            <Card icon={<CalendarCheck size={16} />} label={t("Bookings from ads")} value={num(f?.bookings ?? 0)}
              sub={t("clients: {n}", { n: f?.attributedClients ?? 0 })} />
            <Card icon={<Wallet size={16} />} label={t("Paid")} value={num(f?.paidBookings ?? 0)}
              sub={f ? t("revenue ~{amount}", { amount: idr(f.estRevenue) }) : ""} />
          </div>

          {/* Cost row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card label={t("Cost per lead")} value={usd(data.cost?.perLead)} sub={t("spend / conversations")} muted />
            <Card label={t("Cost per booking")} value={usd(data.cost?.perBooking)} sub={t("spend / bookings")} muted />
            <Card label={t("Cost per paying client")} value={usd(data.cost?.perPayingClient)} sub={t("spend / payments")} muted />
            <Card icon={<TrendingUp size={16} />} label={t("CTR / clicks")}
              value={m ? (m.impressions ? ((m.clicks / m.impressions) * 100).toFixed(2) + "%" : "-") : "-"}
              sub={m ? t("{n} clicks", { n: num(m.clicks) }) : ""} muted />
          </div>

          {!m && (
            <div className="mb-6 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-800 p-3">
              {t("Meta data (spend, impressions, CTR) is hidden: env `FB_ADS_TOKEN` + `FB_AD_ACCOUNT_ID` (and optionally `FB_ADS_CAMPAIGN_ID`) are not set. The database funnel (leads/bookings/payments) already works.")}
            </div>
          )}

          {/* Leads table */}
          <h2 className="text-sm font-semibold mb-2">{t("Ad leads ({n})", { n: data.leads.length })}</h2>
          {data.leads.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 border rounded-lg text-center px-4">
              {t("No tagged leads yet. The first client who comes through a CTWA ad after rollout will appear here with the ad tag, and their booking/payment will be picked up automatically.")}
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr>
                    <th className="px-3 py-2">{t("Client")}</th>
                    <th className="px-3 py-2">{t("Phone")}</th>
                    <th className="px-3 py-2">{t("Ad")}</th>
                    <th className="px-3 py-2">{t("When")}</th>
                    <th className="px-3 py-2 text-center">{t("Booking")}</th>
                    <th className="px-3 py-2 text-center">{t("Payment")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leads.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{l.name || "-"}</td>
                      <td className="px-3 py-2 text-gray-600">{l.phone}</td>
                      <td className="px-3 py-2 text-gray-600">{l.adHeadline || "-"}</td>
                      <td className="px-3 py-2 text-gray-500">{l.at ? new Date(l.at).toLocaleDateString(dateLocale ? "uk-UA" : "en-GB") : "-"}</td>
                      <td className="px-3 py-2 text-center">{l.booked ? "✅" : "-"}</td>
                      <td className="px-3 py-2 text-center">{l.paid ? "💰" : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Card({ icon, label, value, sub, muted }: {
  icon?: React.ReactNode
  label: string
  value: string
  sub?: string
  muted?: boolean
}) {
  return (
    <div className={"rounded-xl border p-3 " + (muted ? "bg-gray-50" : "bg-white")}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">{icon}{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
