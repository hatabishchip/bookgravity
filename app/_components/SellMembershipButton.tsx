"use client"

import { useState, useEffect } from "react"
import PhoneInput from "@/app/_components/PhoneInput"
import { WhatsAppIcon } from "@/app/_components/WhatsAppIcon"
import { validatePhone, detectCountry, subscriberDigits } from "@/lib/phone"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import { useVisualViewport } from "@/lib/use-visual-viewport"
import { cn } from "@/lib/utils"

// Sell a class pass (prepayment) to a client by phone. Used in the trainer
// cabinet, the admin panel AND straight from a booking card (the "Membership /
// Prepaid" button opens this modal pre-filled when the client has no balance
// yet - Sveta 07.07 couldn't find the prepayment flow at the point of need).
// The API scopes to the seller's studio and records who sold it. Two products
// only (owner 07.07): a 5-class pass and a 10-class pass - no free-form sizes.

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "EDC", label: "EDC" },
  { value: "QR", label: "QR" },
  { value: "TRANSFER", label: "Transfer" },
]

const PASS_SIZES = [5, 10] as const
const DEFAULT_CLASSES = 5
const DEFAULT_PRICE = 250000
const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString("en-US")}`

/** Digits (or anything) → the "+"-prefixed value PhoneInput expects. */
function toPhoneValue(raw?: string): string {
  const digits = (raw ?? "").replace(/\D/g, "")
  return digits ? `+${digits}` : "+"
}

// The sell dialog itself — mounted = open. Reused by the trigger button below
// and by booking cards (pre-filled client, onSold to auto-mark the booking).
export function SellMembershipModal({
  initialPhone,
  initialName,
  onClose,
  onSold,
}: {
  initialPhone?: string
  initialName?: string
  onClose: () => void
  /** Fires right after a successful sale with the client's new balance. */
  onSold?: (remaining: number) => void
}) {
  const [phone, setPhone] = useState(() => toPhoneValue(initialPhone))
  const [name, setName] = useState(initialName ?? "")
  const [payment, setPayment] = useState("CASH")
  const [existing, setExisting] = useState<number | null>(null)
  const [hasWhatsApp, setHasWhatsApp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Membership pricing comes from the studio (per-class price x pass size).
  const [perClass, setPerClass] = useState(DEFAULT_PRICE)
  const [classes, setClasses] = useState<number>(DEFAULT_CLASSES)
  // The name field unlocks only once the phone is "finished": either the
  // number hit its max length, or the seller left the phone field (blur) with
  // a valid number. Pre-filled numbers count as committed.
  const [phoneCommitted, setPhoneCommitted] = useState(
    () => validatePhone(toPhoneValue(initialPhone)).kind === "ok",
  )

  // Freeze the page behind the modal so nothing scrolls/jumps with the keyboard.
  useBodyScrollLock(true)
  // Pin the panel to the visible area (above the keyboard) on mobile so it
  // doesn't drift when iOS opens the keyboard.
  const vv = useVisualViewport(true)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  const phoneOk = validatePhone(phone).kind === "ok"
  // "Finished the number": at max length, or committed via blur. Until then the
  // name field stays locked even though the number may already be technically
  // valid (min length).
  const phoneCountry = detectCountry(phone)
  const phoneAtMax = !!phoneCountry && subscriberDigits(phone, phoneCountry) >= phoneCountry.max
  const nameEnabled = phoneOk && (phoneAtMax || phoneCommitted)

  // On open, load the studio's membership pricing (per-class price + default size).
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/memberships`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        if (typeof d.membershipClassPrice === "number") setPerClass(d.membershipClassPrice)
        if (typeof d.membershipClasses === "number" && (PASS_SIZES as readonly number[]).includes(d.membershipClasses)) {
          setClasses(d.membershipClasses)
        }
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [])

  // Once the phone is valid, look up the existing balance and the client's
  // known name (auto-fill if found). Background fetch — does not steal focus.
  useEffect(() => {
    if (!phoneOk) {
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
  }, [phone, phoneOk])

  async function submit() {
    if (!phoneOk || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientPhone: phone, clientName: name.trim(), paymentType: payment, totalClasses: classes }),
      })
      if (!res.ok) {
        setError("Couldn't sell the membership. Please try again.")
        return
      }
      const d = await res.json()
      const remaining = d.remaining ?? classes
      setDone(remaining)
      onSold?.(remaining)
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // Full-screen on mobile, centered card on desktop. Body scroll locked,
    // flex-column so the header stays pinned and only the content scrolls
    // (overscroll-contained) — no rubber-banding to empty space.
    <div
      className="fixed inset-0 z-50 bg-white sm:bg-black/40 sm:flex sm:items-center sm:justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white shadow-xl flex flex-col overscroll-contain absolute inset-0 sm:static sm:inset-auto sm:w-full sm:max-w-sm sm:max-h-[85vh] sm:rounded-2xl"
        style={isMobile && vv ? { top: vv.y, left: vv.x, width: vv.w, height: vv.h, right: "auto", bottom: "auto" } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Membership / Prepaid</h3>
          <button type="button" onClick={onClose} className="text-gray-400 text-xl leading-none p-1">×</button>
        </div>

        {done == null ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {/* Pass size — exactly two products (5 or 10 classes); the total
                recalculates so the seller always states the right amount. */}
            <div className="grid grid-cols-2 gap-1.5">
              {PASS_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setClasses(n)}
                  className={cn(
                    "py-2.5 rounded-xl text-sm font-semibold border touch-manipulation",
                    classes === n
                      ? "bg-brand text-white border-brand"
                      : "bg-white text-gray-600 border-gray-200 hover:border-brand/40",
                  )}
                >
                  {n} classes
                </button>
              ))}
            </div>

            {/* Price banner — per-class price x pass size = the prepayment total. */}
            <div className="rounded-xl bg-brand/[0.08] border border-brand/20 px-4 py-3 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-700">{classes} classes</span>
                <span className="text-[11px] text-gray-400">{classes} × {fmtRp(perClass)}</span>
              </div>
              <span className="text-lg font-bold text-brand">{fmtRp(perClass * classes)}</span>
            </div>

            {/* Phone — large, monospaced-feel digits for readability. */}
            <div className="relative">
              <PhoneInput
                value={phone}
                onChange={(v) => { setPhone(v); setPhoneCommitted(false) }}
                onBlur={(v) => setPhoneCommitted(validatePhone(v).kind === "ok")}
                autoFocus={!initialPhone}
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

            {/* Name — locked until the full phone number is entered. */}
            <input
              type="text"
              value={name}
              disabled={!nameEnabled}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client name"
              className={cn(
                "w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand",
                nameEnabled
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
                      ? "bg-brand text-white border-brand"
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
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
            >
              {submitting ? "Saving…" : `Sell · ${fmtRp(perClass * classes)}`}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="text-3xl mb-2">🎟️</div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Membership sold</h3>
            <p className="text-sm text-gray-500 mb-4">The client now has <b>{done}</b> classes.</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full max-w-xs bg-brand hover:bg-brand-dark text-white font-semibold py-3 rounded-xl"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SellMembershipButton({
  className,
  onSold,
  fullLabel,
}: {
  className?: string
  onSold?: () => void
  // Always show the "Sell membership" label (even on mobile). Used on the
  // dedicated Membership page where the action should read clearly.
  fullLabel?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Compact on narrow screens (icon-only, square) so the trainer header
        // never wraps to two lines; full label on ≥sm where there's room.
        aria-label="Sell membership"
        title="Sell membership"
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-dark whitespace-nowrap shrink-0",
          fullLabel
            ? "px-3.5 py-2 text-sm"
            : "h-9 w-9 text-base sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:text-sm",
          className
        )}
      >
        <span className="leading-none">＋</span>
        <span className={fullLabel ? "inline" : "hidden sm:inline"}>Sell membership</span>
      </button>

      {open && (
        <SellMembershipModal
          onClose={() => setOpen(false)}
          onSold={() => onSold?.()}
        />
      )}
    </>
  )
}
