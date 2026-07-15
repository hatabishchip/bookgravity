"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { Ticket, Search } from "lucide-react"
import SellMembershipButton from "@/app/_components/SellMembershipButton"
import { useT, useLocale } from "@/app/_components/LocaleProvider"

type MembershipClient = {
  clientPhone: string
  clientName: string | null
  remaining: number
  totalSold: number
  purchases: number
  lastSoldAt: string
  lastSoldBy: string | null
}

export default function TrainerMembershipsPage() {
  const t = useT()
  const { dateLocale } = useLocale()
  const [clients, setClients] = useState<MembershipClient[]>([])
  const [loaded, setLoaded] = useState(false)
  const [q, setQ] = useState("")

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/memberships?list=1", { cache: "no-store" })
      if (res.ok) {
        const d = await res.json()
        setClients(Array.isArray(d.clients) ? d.clients : [])
      }
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return clients
    return clients.filter(
      (c) =>
        (c.clientName ?? "").toLowerCase().includes(needle) ||
        c.clientPhone.includes(needle.replace(/\D/g, "")),
    )
  }, [clients, q])

  const activeCount = clients.filter((c) => c.remaining > 0).length

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">{t("Member cards")}</h1>
        <SellMembershipButton fullLabel onSold={fetchClients} />
      </div>
      <p className="text-xs text-gray-500 mb-4">
        {t("Clients who hold a class package. {n} with classes left.", { n: activeCount })}
      </p>

      {/* Search by name or phone - handy once the list grows. */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Search name or phone")}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {!loaded ? (
        <div className="text-sm text-gray-400">{t("Loading…")}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center">
          <Ticket size={28} className="mx-auto text-gray-300" />
          <div className="mt-2 text-sm font-medium text-gray-600">
            {clients.length === 0 ? t("No Member cards yet") : t("No matches")}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {clients.length === 0 ? t("Sell one with the button above.") : t("Try a different name or number.")}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => (
            <li
              key={c.clientPhone}
              className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {c.clientName || t("Unknown client")}
                </div>
                <div className="text-xs text-gray-400 tabular-nums">+{c.clientPhone}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {t("Last sold {date}", { date: format(parseISO(c.lastSoldAt), dateLocale ? "d MMM" : "MMM d", { locale: dateLocale }) })}
                  {c.lastSoldBy ? ` · ${t("by {name}", { name: c.lastSoldBy })}` : ""}
                  {c.purchases > 1 ? ` · ${c.purchases}×` : ""}
                </div>
              </div>
              <div
                className={
                  "shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold " +
                  (c.remaining > 0 ? "bg-brand/10 text-brand" : "bg-gray-100 text-gray-400")
                }
              >
                <Ticket size={13} />
                {t("{n} left", { n: c.remaining })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
