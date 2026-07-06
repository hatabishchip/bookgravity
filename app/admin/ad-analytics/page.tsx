"use client"

import { useState, useEffect, useCallback } from "react"
import { Megaphone, MessageSquare, CalendarCheck, Wallet, TrendingUp } from "lucide-react"
import { PetalSpinner } from "@/app/_components/PetalSpinner"

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
  { key: "maximum", label: "Всё время" },
  { key: "last_30d", label: "30 дней" },
  { key: "last_7d", label: "7 дней" },
]

export default function AdAnalyticsPage() {
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
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Megaphone size={20} /> Реклама - ROI
        </h1>
        <div className="flex gap-1 text-sm">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={
                "px-3 py-1 rounded-full border " +
                (preset === p.key ? "bg-black text-white border-black" : "border-gray-300 text-gray-600")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Сквозная воронка платной рекламы: показы Meta -&gt; переписки -&gt; записи -&gt; оплата. Атрибуция
        по CTWA-метке, first-touch, forward-only (старые лиды до внедрения не размечены). Трата в USD,
        выручка в IDR.
      </p>

      {loading ? (
        <div className="py-20 flex justify-center"><PetalSpinner /></div>
      ) : !data ? (
        <div className="py-20 text-center text-gray-500">Нет доступа или ошибка загрузки.</div>
      ) : (
        <>
          {/* Funnel row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Card icon={<Megaphone size={16} />} label="Трата (Meta)" value={m ? usd(m.spend) : "нет токена"}
              sub={m ? `${num(m.impressions)} показов` : "Meta не подключён"} />
            <Card icon={<MessageSquare size={16} />} label="Переписки"
              value={num(m?.conversations ?? f?.capturedAdLeads ?? 0)}
              sub={m ? `размечено у нас: ${f?.capturedAdLeads ?? 0}` : `размечено: ${f?.capturedAdLeads ?? 0}`} />
            <Card icon={<CalendarCheck size={16} />} label="Записи из рекламы" value={num(f?.bookings ?? 0)}
              sub={`клиентов: ${f?.attributedClients ?? 0}`} />
            <Card icon={<Wallet size={16} />} label="Оплачено" value={num(f?.paidBookings ?? 0)}
              sub={f ? `выручка ~${idr(f.estRevenue)}` : ""} />
          </div>

          {/* Cost row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card label="Цена лида" value={usd(data.cost?.perLead)} sub="трата / переписки" muted />
            <Card label="Цена записи" value={usd(data.cost?.perBooking)} sub="трата / записи" muted />
            <Card label="Цена платящего" value={usd(data.cost?.perPayingClient)} sub="трата / оплаты" muted />
            <Card icon={<TrendingUp size={16} />} label="CTR / клики"
              value={m ? (m.impressions ? ((m.clicks / m.impressions) * 100).toFixed(2) + "%" : "-") : "-"}
              sub={m ? `${num(m.clicks)} кликов` : ""} muted />
          </div>

          {!m && (
            <div className="mb-6 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-800 p-3">
              Данные Meta (трата, показы, CTR) не показаны: не заданы env `FB_ADS_TOKEN` +
              `FB_AD_ACCOUNT_ID` (и опц. `FB_ADS_CAMPAIGN_ID`). Воронка из базы (лиды/записи/оплаты)
              работает уже сейчас.
            </div>
          )}

          {/* Leads table */}
          <h2 className="text-sm font-semibold mb-2">Лиды из рекламы ({data.leads.length})</h2>
          {data.leads.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 border rounded-lg text-center px-4">
              Пока нет размеченных лидов. Первый клиент, пришедший по CTWA-объявлению после внедрения,
              появится здесь с меткой рекламы, а его запись/оплата подтянутся автоматически.
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr>
                    <th className="px-3 py-2">Клиент</th>
                    <th className="px-3 py-2">Телефон</th>
                    <th className="px-3 py-2">Объявление</th>
                    <th className="px-3 py-2">Когда</th>
                    <th className="px-3 py-2 text-center">Запись</th>
                    <th className="px-3 py-2 text-center">Оплата</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leads.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{l.name || "-"}</td>
                      <td className="px-3 py-2 text-gray-600">{l.phone}</td>
                      <td className="px-3 py-2 text-gray-600">{l.adHeadline || "-"}</td>
                      <td className="px-3 py-2 text-gray-500">{l.at ? new Date(l.at).toLocaleDateString("ru-RU") : "-"}</td>
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
