"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { Ticket, Search, ChevronDown, MinusCircle, Trash2 } from "lucide-react"
import SellMembershipButton from "@/app/_components/SellMembershipButton"
import { useT, useLocale } from "@/app/_components/LocaleProvider"
import { cn } from "@/lib/utils"

type MembershipClient = {
  clientPhone: string
  clientName: string | null
  remaining: number
  totalSold: number
  purchases: number
  lastSoldAt: string
  lastSoldBy: string | null
}

type Card = {
  id: string
  totalClasses: number
  remainingClasses: number
  paymentType: string
  soldByName: string | null
  createdAt: string
  note: string | null
}

export default function TrainerMembershipsPage() {
  const t = useT()
  const { dateLocale } = useLocale()
  const [clients, setClients] = useState<MembershipClient[]>([])
  const [loaded, setLoaded] = useState(false)
  const [q, setQ] = useState("")
  // Admin extras (Sveta 19.07): expand a client to see every card, cancel a
  // mistaken sale, deduct already-used classes retroactively.
  const [isAdmin, setIsAdmin] = useState(false)
  const [openPhone, setOpenPhone] = useState<string | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [cardsLoading, setCardsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch("/api/memberships?list=1", { cache: "no-store" })
      if (res.ok) {
        const d = await res.json()
        setClients(Array.isArray(d.clients) ? d.clients : [])
        setIsAdmin(d.isAdmin === true)
      }
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  const fetchCards = useCallback(async (phone: string) => {
    setCardsLoading(true)
    setPanelError(null)
    try {
      const res = await fetch(`/api/memberships?phone=${encodeURIComponent(phone)}`, { cache: "no-store" })
      const d = res.ok ? await res.json() : { memberships: [] }
      setCards(Array.isArray(d.memberships) ? d.memberships : [])
    } finally {
      setCardsLoading(false)
    }
  }, [])

  const toggleClient = (c: MembershipClient) => {
    if (!isAdmin) return
    if (openPhone === c.clientPhone) { setOpenPhone(null); return }
    setOpenPhone(c.clientPhone)
    setCards([])
    fetchCards(c.clientPhone)
  }

  const deduct = async (c: MembershipClient) => {
    const raw = prompt(t("How many already-used classes to deduct?"), "1")
    if (raw == null) return
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 1) return
    setBusy(true)
    setPanelError(null)
    try {
      const res = await fetch("/api/memberships", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deduct", clientPhone: c.clientPhone, classes: n }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setPanelError(d.error ?? t("Could not deduct")); return }
      await fetchClients()
      await fetchCards(c.clientPhone)
    } finally {
      setBusy(false)
    }
  }

  const cancelCard = async (c: MembershipClient, card: Card) => {
    if (!confirm(t("Cancel this Member card sale? This removes the card completely."))) return
    setBusy(true)
    setPanelError(null)
    try {
      const res = await fetch(`/api/memberships?id=${encodeURIComponent(card.id)}`, { method: "DELETE" })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setPanelError(d.error ?? t("Could not cancel")); return }
      await fetchClients()
      await fetchCards(c.clientPhone)
    } finally {
      setBusy(false)
    }
  }

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
            <li key={c.clientPhone} className="rounded-2xl border border-gray-100 bg-white">
              <div
                className={cn("flex items-center gap-3 px-4 py-3", isAdmin && "cursor-pointer")}
                onClick={() => toggleClient(c)}
                role={isAdmin ? "button" : undefined}
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
                {isAdmin && (
                  <ChevronDown
                    size={15}
                    className={cn("shrink-0 text-gray-300 transition-transform", openPhone === c.clientPhone && "rotate-180")}
                  />
                )}
              </div>

              {/* Admin panel: every card + cancel; retroactive deduct (Sveta 19.07). */}
              {isAdmin && openPhone === c.clientPhone && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                  {cardsLoading ? (
                    <div className="text-xs text-gray-400">{t("Loading…")}</div>
                  ) : (
                    <>
                      {cards.map((card) => (
                        <div key={card.id} className="flex items-center gap-2 text-xs">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-gray-700">
                              {format(parseISO(card.createdAt), "d MMM yyyy")} · {t("{n} classes", { n: card.totalClasses })}
                            </span>
                            <span className="text-gray-400"> · {card.remainingClasses}/{card.totalClasses} {t("left")}</span>
                            <span className={cn("ml-1", card.paymentType === "FREE" ? "text-emerald-600 font-semibold" : "text-gray-400")}>
                              · {card.paymentType === "FREE" ? t("Free") : card.paymentType}
                            </span>
                            {card.soldByName ? <span className="text-gray-400"> · {card.soldByName}</span> : null}
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => { e.stopPropagation(); cancelCard(c, card) }}
                            title={t("Cancel this sale (mistake)")}
                            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {cards.length === 0 && <div className="text-xs text-gray-400">{t("No cards found")}</div>}

                      <button
                        type="button"
                        disabled={busy || c.remaining === 0}
                        onClick={(e) => { e.stopPropagation(); deduct(c) }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-brand/40 hover:text-brand disabled:opacity-50"
                      >
                        <MinusCircle size={13} />
                        {t("Deduct used classes")}
                      </button>

                      {panelError && <div className="text-xs text-red-500">{panelError}</div>}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
