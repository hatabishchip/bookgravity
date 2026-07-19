"use client"

import { useState, useEffect } from "react"
import PhoneInput from "@/app/_components/PhoneInput"
import { useT } from "@/app/_components/LocaleProvider"
import { WhatsAppIcon } from "@/app/_components/WhatsAppIcon"
import { validatePhone, detectCountry, subscriberDigits } from "@/lib/phone"
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock"
import { useVisualViewport } from "@/lib/use-visual-viewport"
import { cn } from "@/lib/utils"

// Sell a MEMBER CARD to a client by phone (terminology unified 10.07 - the
// printed cards are "Member cards", no "pass"/"loyalty" wording anywhere).
// Two products only (owner 10.07): pay for 5 -> 6 classes on the card (1.5M),
// pay for 10 -> 12 classes (3M, for bule). The API scopes to the seller's
// studio and records who sold it. Selling lives on the client pages - paying
// a class FROM the card is the "Member card" chip among the payment methods.

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "EDC", label: "EDC" },
  { value: "QR", label: "QR" },
  { value: "TRANSFER", label: "Transfer" },
]

// classes = what lands on the card; payFor = what the client pays for.
const PRODUCTS = [
  { classes: 6, payFor: 5 },
  { classes: 12, payFor: 10 },
] as const
const DEFAULT_CLASSES = 6
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
  const t = useT()
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
  // Admins additionally see the FREE option (gifted cards / cards paid long
  // ago entered after the fact) - such sales never hit cashflow (Sveta 19.07).
  const [isAdmin, setIsAdmin] = useState(false)
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
        if (d.isAdmin === true) setIsAdmin(true)
        if (typeof d.membershipClasses === "number" && PRODUCTS.some((pr) => pr.classes === d.membershipClasses)) {
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
        setError(t("Couldn't sell the Member card. Please try again."))
        return
      }
      const d = await res.json()
      const remaining = d.remaining ?? classes
      setDone(remaining)
      onSold?.(remaining)
    } catch {
      setError(t("Network error. Please try again."))
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
          <h3 className="text-base font-semibold text-gray-900">{t("Member card")}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 text-xl leading-none p-1">×</button>
        </div>

        {done == null ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {/* Exactly two products; the free classes are already on the card. */}
            <div className="grid grid-cols-2 gap-1.5">
              {PRODUCTS.map((pr) => (
                <button
                  key={pr.classes}
                  type="button"
                  onClick={() => setClasses(pr.classes)}
                  className={cn(
                    "py-2.5 rounded-xl text-sm font-semibold border touch-manipulation flex flex-col items-center gap-0.5",
                    classes === pr.classes
                      ? "bg-brand text-white border-brand"
                      : "bg-white text-gray-600 border-gray-200 hover:border-brand/40",
                  )}
                >
                  <span>{t("{n} classes", { n: pr.classes })}</span>
                  <span className={cn("text-[10px] font-medium", classes === pr.classes ? "text-white/80" : "text-gray-400")}>
                    {t("pay for {payFor} · {free} free", { payFor: pr.payFor, free: pr.classes - pr.payFor })}
                  </span>
                </button>
              ))}
            </div>

            {/* Price banner - what the client pays now for the whole card. */}
            <div className="rounded-xl bg-brand/[0.08] border border-brand/20 px-4 py-3 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-700">{t("Member card")} · {t("{n} classes", { n: classes })}</span>
                <span className="text-[11px] text-gray-400">{t("{price} per class", { price: fmtRp(perClass) })}</span>
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
                  title={t("On WhatsApp")}
                  aria-label={t("On WhatsApp")}
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
              placeholder={t("Client name")}
              className={cn(
                "w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand",
                nameEnabled
                  ? "border-gray-300 text-gray-900"
                  : "border-gray-200 bg-gray-50 text-gray-400 placeholder:text-gray-300"
              )}
            />

            {existing != null && existing > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                {t("This client already has")} <b>{existing}</b> {t("classes. The new Member card adds to their balance.")}
              </div>
            )}

            {/* Payment method — chips, no label. FREE is admin-only. */}
            <div className={cn("grid gap-1.5", isAdmin ? "grid-cols-5" : "grid-cols-4")}>
              {(isAdmin ? [...PAYMENT_METHODS, { value: "FREE", label: "Free" }] : PAYMENT_METHODS).map((pm) => (
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
                  {t(pm.label)}
                </button>
              ))}
            </div>

            {payment === "FREE" && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
                {t("Free card: a gift or a card paid earlier. It will NOT appear in cashflow.")}
              </div>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}

            <button
              type="button"
              disabled={!phoneOk || !name.trim() || submitting}
              onClick={submit}
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-3 rounded-xl"
            >
              {submitting ? t("Saving…") : payment === "FREE" ? `${t("Sell Member card")} · ${t("Free")}` : `${t("Sell Member card")} · ${fmtRp(perClass * classes)}`}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="text-3xl mb-2">🎟️</div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">{t("Member card sold")}</h3>
            <p className="text-sm text-gray-500 mb-4">{t("The card now holds")} <b>{done}</b> {t("classes.")}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full max-w-xs bg-brand hover:bg-brand-dark text-white font-semibold py-3 rounded-xl"
            >
              {t("Done")}
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
  const t = useT()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Compact on narrow screens (icon-only, square) so the trainer header
        // never wraps to two lines; full label on ≥sm where there's room.
        aria-label={t("Sell a Member card")}
        title={t("Sell a Member card")}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-dark whitespace-nowrap shrink-0",
          fullLabel
            ? "px-3.5 py-2 text-sm"
            : "h-9 w-9 text-base sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:text-sm",
          className
        )}
      >
        <span className="leading-none">＋</span>
        <span className={fullLabel ? "inline" : "hidden sm:inline"}>{t("Sell Member card")}</span>
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
