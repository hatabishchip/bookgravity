"use client"

// Agent journal (owner 15.07.2026): every agent-touched exchange as
// "what the client asked - what was answered", in Russian. Mobile-first:
// stacked cards, no wide table. Canggu only (the API 404s elsewhere).
import { useState, useEffect, useCallback } from "react"
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import { useT, useLocale } from "@/app/_components/LocaleProvider"

type Item = {
  id: string
  createdAt: string
  clientName: string
  category: "SAFE" | "BOOKING" | "ESCALATE"
  status: "pending" | "sent" | "edited_sent" | "auto_sent" | "dismissed" | "expired"
  question: string | null
  questionTranslated: boolean
  answer: string | null
  answerTranslated: boolean
}
type Data = { page: number; pageSize: number; total: number; items: Item[] }

const STATUS_STYLE: Record<Item["status"], string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  edited_sent: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  auto_sent: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  dismissed: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400",
  expired: "bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500",
}

export default function AgentLogPage() {
  const t = useT()
  const { dateLocale } = useLocale()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/admin/agent-log?page=${p}`, { cache: "no-store" })
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

  useEffect(() => { void load(page) }, [page, load])

  const statusLabel: Record<Item["status"], string> = {
    pending: t("Pending"),
    sent: t("Sent as is"),
    edited_sent: t("Sent edited"),
    auto_sent: t("Auto-sent"),
    dismissed: t("Dismissed"),
    expired: t("Expired"),
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <ScrollText className="text-brand" size={26} />
        <h1 className="text-xl font-semibold dark:text-gray-100">{t("Agent journal")}</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {t("What clients asked and what was answered, in Russian. Fresh rows are translated within half an hour.")}
      </p>

      {loading ? (
        <div className="py-16 flex justify-center"><PetalSpinner /></div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{error}</div>
      ) : data && data.items.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">{t("No data yet")}</div>
      ) : data ? (
        <>
          <div className="space-y-2">
            {data.items.map((it) => (
              <div key={it.id} className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium dark:text-gray-100">{it.clientName}</span>
                  <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-semibold " + STATUS_STYLE[it.status]}>
                    {statusLabel[it.status]}
                  </span>
                  {it.category !== "SAFE" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300">
                      {it.category === "BOOKING" ? t("Booking") : t("Escalation")}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-gray-400">
                    {new Date(it.createdAt).toLocaleString(dateLocale ? "uk-UA" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="mt-1.5 grid gap-1.5">
                  <div className="text-[13px]">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mr-1.5">{t("Asked")}</span>
                    <span className="text-gray-700 dark:text-gray-200">
                      {it.question ?? <span className="text-gray-400">-</span>}
                      {it.question && !it.questionTranslated && <span className="text-[10px] text-gray-400 ml-1">({t("original")})</span>}
                    </span>
                  </div>
                  <div className="text-[13px]">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mr-1.5">{t("Answered")}</span>
                    <span className="text-gray-700 dark:text-gray-200">
                      {it.status === "dismissed"
                        ? <span className="text-gray-400">{t("not sent (dismissed)")}</span>
                        : it.answer ?? <span className="text-gray-400">{t("awaiting")}</span>}
                      {it.answer && it.status !== "dismissed" && !it.answerTranslated && <span className="text-[10px] text-gray-400 ml-1">({t("original")})</span>}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-2 rounded-lg border border-gray-200 dark:border-white/15 disabled:opacity-40 dark:text-gray-200"
                aria-label={t("Previous page")}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">{page} / {pages}</span>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded-lg border border-gray-200 dark:border-white/15 disabled:opacity-40 dark:text-gray-200"
                aria-label={t("Next page")}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
