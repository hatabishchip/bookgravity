"use client"

import { useState, useEffect } from "react"
import PhoneInput from "@/app/_components/PhoneInput"
import { validatePhone } from "@/lib/phone"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import { cn } from "@/lib/utils"

// Sell a 5-class membership to a client by phone. Used in both the trainer
// cabinet and the admin panel — the API scopes to the seller's studio and
// records who sold it. Shows any existing balance so the seller doesn't
// double-sell by accident.

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "EDC", label: "EDC" },
  { value: "QR", label: "QR" },
  { value: "TRANSFER", label: "Transfer" },
]

const MEMBERSHIP_CLASSES = 5

export default function SellMembershipButton({
  className,
  onSold,
}: {
  className?: string
  onSold?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [payment, setPayment] = useState("CASH")
  const [existing, setExisting] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Freeze the page behind the modal — without this the background (and the
  // modal) jump around when the numeric keyboard opens on mobile.
  useBodyScrollLock(open)

  const phoneOk = validatePhone(phone).kind === "ok"

  // Look up any existing balance once the phone is valid.
  useEffect(() => {
    if (!open || !phoneOk) {
      setExisting(null)
      return
    }
    const ctrl = new AbortController()
    fetch(`/api/memberships?phone=${encodeURIComponent(phone)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { remaining: 0 }))
      .then((d: { remaining: number }) => setExisting(d.remaining ?? 0))
      .catch(() => setExisting(null))
    return () => ctrl.abort()
  }, [open, phone, phoneOk])

  function reset() {
    setPhone("")
    setName("")
    setPayment("CASH")
    setExisting(null)
    setDone(null)
    setError(null)
  }

  async function submit() {
    if (!phoneOk || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientPhone: phone, clientName: name.trim(), paymentType: payment }),
      })
      if (!res.ok) {
        setError("Couldn't sell the membership. Please try again.")
        return
      }
      const d = await res.json()
      setDone(d.remaining ?? MEMBERSHIP_CLASSES)
      onSold?.()
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true) }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg bg-[#2C6E49] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1E4D34]",
          className
        )}
      >
        <span className="text-base leading-none">＋</span> Sell membership
      </button>

      {open && (
        // Fixed full-screen overlay; centered card. Body scroll is locked and
        // the layout viewport resizes with the keyboard (viewport
        // interactiveWidget=resizes-content), so nothing scrolls behind.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {done == null ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-900">Membership · {MEMBERSHIP_CLASSES} classes</h3>
                  <button type="button" onClick={() => setOpen(false)} className="text-gray-400 text-xl leading-none">×</button>
                </div>

                <div className="space-y-3">
                  <PhoneInput value={phone} onChange={setPhone} label="Client phone" required autoFocus />

                  {existing != null && existing > 0 && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                      This client already has <b>{existing}</b> classes. The new membership is added to their balance.
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-gray-400">(optional)</span></label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Client name"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment for the membership</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PAYMENT_METHODS.map((pm) => (
                        <button
                          key={pm.value}
                          type="button"
                          onClick={() => setPayment(pm.value)}
                          className={cn(
                            "py-2 rounded-lg text-sm font-semibold border",
                            payment === pm.value
                              ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                              : "bg-white text-gray-600 border-gray-200"
                          )}
                        >
                          {pm.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && <div className="text-sm text-red-500">{error}</div>}

                  <button
                    type="button"
                    disabled={!phoneOk || submitting}
                    onClick={submit}
                    className="w-full bg-[#2C6E49] hover:bg-[#1E4D34] disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
                  >
                    {submitting ? "Saving…" : `Sell (${MEMBERSHIP_CLASSES} classes)`}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">🎟️</div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Membership sold</h3>
                <p className="text-sm text-gray-500 mb-4">The client now has <b>{done}</b> classes.</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full bg-[#2C6E49] hover:bg-[#1E4D34] text-white font-semibold py-3 rounded-xl"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
