"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import { AddClientForm, type NewClient } from "@/app/_components/AddClientForm"

// Client list collected inside a NOT-yet-saved session card (Schedule / Beta
// creators). The slot has no id until the form is saved, so these clients are
// queued in local state and booked by the parent right after the slot is
// created. Mirrors the phone-first AddClientForm used everywhere else.

export function QueuedClients({
  clients,
  onChange,
  capacity,
}: {
  clients: NewClient[]
  onChange: (next: NewClient[]) => void
  capacity: number
}) {
  const [adding, setAdding] = useState(false)
  const seatsLeft = capacity - clients.length

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">
          Clients ({clients.length}/{capacity})
        </span>
        {!adding && seatsLeft > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2C6E49] hover:underline"
          >
            <Plus size={12} /> Add client
          </button>
        )}
      </div>

      {clients.map((c, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-800 truncate">{c.clientName}</div>
            <div className="text-[11px] text-gray-500 truncate">{c.clientPhone}</div>
          </div>
          <button
            type="button"
            onClick={() => onChange(clients.filter((_, j) => j !== i))}
            aria-label="Remove client"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-rose-500 hover:bg-rose-50"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {adding && (
        <AddClientForm
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
