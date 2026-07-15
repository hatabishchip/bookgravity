"use client"

// AI sales agent statistics (suggest-mode) - Canggu only (owner 15.07.2026).
// Mirrors the Ad ROI page layout: preset switch, stat cards, recent list.
import { useState, useEffect, useCallback } from "react"
import { Bot, Send, PencilLine, XCircle, Hourglass, CalendarClock, AlertTriangle } from "lucide-react"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { useT, useLocale } from "@/app/_components/LocaleProvider"

type Data = {
  preset: string
  total: number
  byCategory: { SAFE: number; BOOKING: number; ESCALATE: number }
  byStatus: { pending: number; sent: number; edited_sent: number; dismissed: number }
  acceptanceRate: number | null
  editRate: number | null
  recent: {
    id: string
    clientName: string
    category: "SAFE" | "BOOKING" | "ESCALATE"
    status: "pending" | "sent" | "edited_sent" | "dismissed"
    draft: string | null
    reason: string | null
    createdAt: string
  }[]
  generatedAt: string
}

const PRESETS = [
  { key: "maximum", label: "All time" },
  { key: "last_30d", label: "30 days" },
  { key: "last_7d", label: "7 days" },
]

const pct = (v: number | null) => (v == null ? "-" : Math.round(v * 100) + "%")

const STATUS_STYLE: Record<Data["recent"][number]["status"], string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  edited_sent: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  dismissed: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
}

export default function AgentStatsPage() {
  const t = useT()
  const { dateLocale } = useLocale()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState("maximum")
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: string) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/admin/agent-stats?preset=${p}`, { cache: "no-store" })
      if (!r.ok) {
        setError(r.status === 404 ? t("Agent is enabled for the Canggu studio only") : `HTTP ${r.status}`)
        setData(null)
        return
      }
      setData((await r.json()) as Data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load(preset) }, [preset, load])

  const statusLabel: Record<Data["recent"][number]["status"], string> = {
    pending: t("Pending"),
    sent: t("Sent as is"),
    edited_sent: t("Sent edited"),
    dismissed: t("Dismissed"),
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Bot className="text-brand" size={26} />
        <h1 className="text-xl font-semibold dark:text-gray-100">{t("Agent statistics")}</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {t("Every suggestion the agent drafted and what staff did with it. The agent never sends anything itself.")}
      </p>

      <div className="flex gap-2 mb-5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={
              "px-3 py-1.5 rounded-full text-sm border transition " +
              (preset === p.key
                ? "bg-brand text-white border-brand"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/15 dark:text-gray-300 dark:hover:bg-white/5")
            }
          >
            {t(p.label)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><PetalSpinner /></div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{error}</div>
      ) : data ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <Card icon={<Bot size={16} />} label={t("Suggestions")} value={String(data.total)} />
            <Card icon={<Send size={16} />} label={t("Sent as is")} value={String(data.byStatus.sent)} />
            <Card icon={<PencilLine size={16} />} label={t("Sent edited")} value={String(data.byStatus.edited_sent)} />
            <Card icon={<XCircle size={16} />} label={t("Dismissed")} value={String(data.byStatus.dismissed)} />
            <Card icon={<Hourglass size={16} />} label={t("Pending")} value={String(data.byStatus.pending)} />
            <Card icon={<Send size={16} />} label={t("Acceptance")} value={pct(data.acceptanceRate)} hint={t("of decided drafts")} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            <Card icon={<Bot size={16} />} label={t("Answerable (SAFE)")} value={String(data.byCategory.SAFE)} />
            <Card icon={<CalendarClock size={16} />} label={t("Booking questions")} value={String(data.byCategory.BOOKING)} hint={t("left to trainers")} />
            <Card icon={<AlertTriangle size={16} />} label={t("Escalations")} value={String(data.byCategory.ESCALATE)} hint={t("left to trainers")} />
          </div>

          {/* Recent suggestions */}
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">{t("Recent suggestions")}</h2>
          {data.recent.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">{t("No data yet")}</div>
          ) : (
            <div className="space-y-2">
              {data.recent.map((s) => (
                <div key={s.id} className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium dark:text-gray-100">{s.clientName}</span>
                    <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-semibold " + STATUS_STYLE[s.status]}>
                      {statusLabel[s.status]}
                    </span>
                    {s.category !== "SAFE" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300">
                        {s.category === "BOOKING" ? t("Booking") : t("Escalation")}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-gray-400">
                      {new Date(s.createdAt).toLocaleString(dateLocale ? "uk-UA" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {(s.draft || s.reason) && (
                    <div className="mt-1 text-[12px] text-gray-500 dark:text-gray-400 line-clamp-2">
                      {s.draft || s.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

function Card({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">{icon}{label}</div>
      <div className="text-lg font-semibold dark:text-gray-100 mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-gray-400">{hint}</div>}
    </div>
  )
}
