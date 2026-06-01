"use client"

import { useState, useEffect } from "react"
import PhoneInput from "@/app/_components/PhoneInput"
import { WhatsAppIcon } from "@/app/_components/WhatsAppIcon"
import { validatePhone } from "@/lib/phone"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import { useVisualViewport } from "@/lib/use-visual-viewport"
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
  const [hasWhatsApp, setHasWhatsApp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Freeze the page behind the modal so nothing scrolls/jumps with the keyboard.
  useBodyScrollLock(open)
  // Pin the panel to the visible area (above the keyboard) on mobile so it
  // doesn't drift when iOS opens the keyboard.
  const vv = useVisualViewport(open)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  const phoneOk = validatePhone(phone).kind === "ok"

  // Once the phone is valid, look up the existing balance and the client's
  // known name (auto-fill if found). Background fetch — does not steal focus.
  useEffect(() => {
    if (!open || !phoneOk) {
      setExisting(null)
      setHasWhatsApp(false)
      return
    }
    const ctrl = new AbortController()
    fetch(`/api/memberships?phone=${encodeURIComponent(phone)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { remaining: 0, name: null, hasWhatsApp: false }))
      .then((d: { remaining: number; name: string | null; hasWhatsApp?: boolean }) => {
        setExisting(d.remaining ?? 0)
        setHasWhatsApp(!!d.hasWhatsApp)
        if (d.name) setName((prev) => (prev.trim() ? prev : d.name!))
      })
      .catch(() => { setExisting(null); setHasWhatsApp(false) })
    return () => ctrl.abort()
  }, [open, phone, phoneOk])

  function reset() {
    setPhone("")
    setName("")
    setPayment("CASH")
    setExisting(null)
    setHasWhatsApp(false)
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
        // Full-screen on mobile, centered card on desktop. Body scroll locked,
        // flex-column so the header stays pinned and only the content scrolls
        // (overscroll-contained) — no rubber-banding to empty space.
        <div
          className="fixed inset-0 z-50 bg-white sm:bg-black/40 sm:flex sm:items-center sm:justify-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white shadow-xl flex flex-col overscroll-contain absolute inset-0 sm:static sm:inset-auto sm:w-full sm:max-w-sm sm:max-h-[85vh] sm:rounded-2xl"
            style={isMobile && vv ? { top: vv.y, left: vv.x, width: vv.w, height: vv.h, right: "auto", bottom: "auto" } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Membership · {MEMBERSHIP_CLASSES} classes</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 text-xl leading-none p-1">×</button>
            </div>

            {done == null ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {/* Phone — large, monospaced-feel digits for readability. */}
                <div className="relative">
                  <PhoneInput
                    value={phone}
                    onChange={setPhone}
                    autoFocus
                    hideHint
                    inputClassName="text-lg tracking-wide tabular-nums pr-9"
                  />
                  {/* This number is on WhatsApp (we've had contact with it). */}
                  {phoneOk && hasWhatsApp && (
                    <span
                      className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      title="On WhatsApp"
                      aria-label="On WhatsApp"
                    >
                      <WhatsAppIcon size={15} />
                    </span>
                  )}
                </div>

                {/* Name — same field size, larger text; muted until phone valid. */}
                <input
                  type="text"
                  value={name}
                  disabled={!phoneOk}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Client name"
                  className={cn(
                    "w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]",
                    phoneOk
                      ? "border-gray-300 text-gray-900"
                      : "border-gray-200 bg-gray-50 text-gray-400 placeholder:text-gray-300"
                  )}
                />

                {existing != null && existing > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                    This client already has <b>{existing}</b> classes. The new membership is added to their balance.
                  </div>
                )}

                {/* Payment method — chips, no label. */}
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

                {error && <div className="text-sm text-red-500">{error}</div>}

                <button
                  type="button"
                  disabled={!phoneOk || !name.trim() || submitting}
                  onClick={submit}
                  className="w-full bg-[#2C6E49] hover:bg-[#1E4D34] disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
                >
                  {submitting ? "Saving…" : `Sell (${MEMBERSHIP_CLASSES} classes)`}
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <div className="text-3xl mb-2">🎟️</div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Membership sold</h3>
                <p className="text-sm text-gray-500 mb-4">The client now has <b>{done}</b> classes.</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full max-w-xs bg-[#2C6E49] hover:bg-[#1E4D34] text-white font-semibold py-3 rounded-xl"
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
