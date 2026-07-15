"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import { AddClientForm, type NewClient } from "@/app/_components/AddClientForm"
import { useT } from "@/app/_components/LocaleProvider"

// Client list collected inside a NOT-yet-saved session card (Schedule / Beta
// creators). The slot has no id until the form is saved, so these clients are
// queued in local state and booked by the parent right after the slot is
// created. Mirrors the phone-first AddClientForm used everywhere else.

export function QueuedClients({
  clients,
  onChange,
  capacity,
  canAdd = true,
}: {
  clients: NewClient[]
  onChange: (next: NewClient[]) => void
  capacity: number
  canAdd?: boolean
}) {
  const t = useT()
  const [adding, setAdding] = useState(false)
  // Each queued client can cover several people (partySize), so seats used is
  // the SUM of party sizes, not the number of rows.
  const usedSeats = clients.reduce((s, c) => s + (c.partySize || 1), 0)
  const seatsLeft = capacity - usedSeats

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">
          {t("Clients")} ({usedSeats}/{capacity})
        </span>
        {!adding && seatsLeft > 0 && canAdd && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
          >
            <Plus size={12} /> {t("Add client")}
          </button>
        )}
        {!adding && seatsLeft > 0 && !canAdd && (
          <span className="text-[10px] text-gray-400">{t("Assign a trainer first")}</span>
        )}
      </div>

      {clients.map((c, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-800 truncate">
              {c.clientName}
              {(c.partySize || 1) > 1 && (
                <span className="ml-1 text-[10px] font-bold text-brand">×{c.partySize}</span>
              )}
            </div>
            <div className="text-[11px] text-gray-500 truncate">{c.clientPhone}</div>
          </div>
          <button
            type="button"
            onClick={() => onChange(clients.filter((_, j) => j !== i))}
            aria-label={t("Remove client")}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-rose-500 hover:bg-rose-50"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {adding && (
        <AddClientForm
          maxParty={seatsLeft}
          onSubmit={(c) => {
            onChange([...clients, c])
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  )
}
