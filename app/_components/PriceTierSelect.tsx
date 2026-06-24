"use client"

import { cn } from "@/lib/utils"
import { PRICE_TIERS, PRICE_TIER_LABEL, type PriceTier } from "@/lib/payments"

// Three-way price-tier picker shown at payment time. The coach marks which base
// price this class counts for — the trainer's 20% commission (and the cash-flow
// revenue) is computed off it. Replaces the old single "Local" checkbox.
//   Full   → the slot's full group price (e.g. 300k)
//   Member → membership/subscription price (e.g. 250k)
//   Local  → Indonesian local-resident price (e.g. 200k)
export default function PriceTierSelect({
  value,
  fullPrice,
  memberPrice,
  localPrice,
  disabled,
  onChange,
}: {
  value?: string | null
  fullPrice: number
  memberPrice: number
  localPrice: number
  disabled?: boolean
  onChange: (tier: PriceTier) => void
}) {
  // Legacy bookings (no tier) render as Full — the historical default.
  const selected: PriceTier = value === "MEMBER" || value === "LOCAL" ? value : "FULL"
  const priceFor = (t: PriceTier) =>
    t === "FULL" ? fullPrice : t === "MEMBER" ? memberPrice : localPrice

  return (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1.5 font-medium">
        Price tier (for 20% commission)
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        {PRICE_TIERS.map((t) => {
          const isSel = selected === t
          return (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => onChange(t)}
              className={cn(
                "px-2 py-2 rounded-lg border text-center touch-manipulation disabled:opacity-50 flex flex-col items-center gap-0.5",
                isSel ? "bg-brand/5 border-brand/30" : "bg-white border-gray-200 hover:border-brand/40",
              )}
            >
              <span className={cn("text-xs font-semibold", isSel ? "text-brand" : "text-gray-600")}>
                {PRICE_TIER_LABEL[t]}
              </span>
              <span className={cn("text-[10px]", isSel ? "text-brand/80" : "text-gray-400")}>
                {Math.round(priceFor(t) / 1000)}k
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
