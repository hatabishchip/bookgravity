"use client"

import { useState } from "react"
import { ArrowRightLeft, X, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { WhatsAppIcon } from "@/app/_components/WhatsAppIcon"

// A single registered-client row used inside both the Schedule and the Beta
// Schedule class editors. Keeps the Move / Cancel actions visually identical
// across both screens — bigger, friendlier touch targets than plain links.

export type MoveTarget = { id: string; label: string }

export function ClientBookingRow({
  name,
  phone,
  whatsappHref,
  targets,
  onMove,
  onCancel,
  paid = false,
}: {
  name: string
  phone?: string | null
  /** When provided, the phone renders as a tappable WhatsApp link. */
  whatsappHref?: string | null
  /** Other classes with a free seat the client can be moved to. */
  targets: MoveTarget[]
  onMove: (targetId: string) => void
  onCancel: () => void
  /** When the client has already paid, the Cancel action is hidden. */
  paid?: boolean
}) {
  const [moving, setMoving] = useState(false)

  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-gray-800 truncate">{name}</div>
        {phone &&
          (whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#25D366]"
            >
              <WhatsAppIcon size={11} />
              {phone}
            </a>
          ) : (
            <div className="text-xs text-gray-500">{phone}</div>
          ))}
      </div>

      {moving ? (
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <select
              autoFocus
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onMove(e.target.value)
                  setMoving(false)
                }
              }}
              className="appearance-none text-xs font-medium border border-[#2C6E49]/40 text-[#2C6E49] rounded-lg pl-2.5 pr-7 py-2 max-w-[160px] bg-[#2C6E49]/5 focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
            >
              <option value="" disabled>
                Move to…
              </option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <Check
              size={13}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#2C6E49]"
            />
          </div>
          <button
            type="button"
            onClick={() => setMoving(false)}
            aria-label="Cancel move"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 active:scale-95 transition"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMoving(true)}
            disabled={targets.length === 0}
            title={
              targets.length === 0
                ? "No other class with a free seat"
                : "Move to another class"
            }
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition active:scale-95",
              targets.length === 0
                ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                : "bg-[#2C6E49]/10 text-[#2C6E49] hover:bg-[#2C6E49]/15",
            )}
          >
            <ArrowRightLeft size={14} strokeWidth={2.25} />
            Move
          </button>
          {!paid && (
            <button
              type="button"
              onClick={onCancel}
              title="Cancel this booking"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95 transition"
            >
              <X size={14} strokeWidth={2.5} />
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}
