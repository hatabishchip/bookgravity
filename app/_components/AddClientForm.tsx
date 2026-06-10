"use client"

import { useEffect, useRef, useState } from "react"
import PhoneInput from "@/app/_components/PhoneInput"
import { detectCountry, subscriberDigits, validatePhone } from "@/lib/phone"

// Manual "add client to a class" form, shared by Schedule and Beta Schedule.
//
// Phone is the FIRST field and uses the same PhoneInput rules as the public
// booking widget: country auto-detection, the "+" is always present, and the
// flag/country shows beneath. Once the number is long enough we look the
// client up in the DB and, if found, auto-fill their name and email (only
// when those fields are still empty, so the operator can override).

export type NewClient = {
  clientName: string
  clientPhone: string
  clientEmail: string
  clientTelegram: string
  partySize: number
}

export function AddClientForm({
  onSubmit,
  onCancel,
  submitting,
  maxParty = 6,
}: {
  onSubmit: (c: NewClient) => void
  onCancel: () => void
  submitting?: boolean
  // Largest party that still fits the class (remaining seats, capped at 6).
  maxParty?: number
}) {
  // Pre-seed with the studios' country code so the "+" and flag show at once.
  const [phone, setPhone] = useState("+62 ")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const partyMax = Math.max(1, Math.min(6, maxParty))
  const [partySize, setPartySize] = useState(1)
  const [lookup, setLookup] = useState<"idle" | "loading" | "found" | "new">("idle")
  const lastLookedUp = useRef("")

  // Debounced-ish DB lookup once the phone reaches its country's min length.
  useEffect(() => {
    const country = detectCountry(phone)
    const ready = !!country && subscriberDigits(phone, country) >= country.min
    if (!ready) {
      setLookup("idle")
      lastLookedUp.current = ""
      return
    }
    if (lastLookedUp.current === phone) return
    lastLookedUp.current = phone
    setLookup("loading")
    const ctrl = new AbortController()
    fetch(`/api/lookup-client?phone=${encodeURIComponent(phone)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { name: null, email: null }))
      .then((d: { name: string | null; email: string | null }) => {
        if (d.name || d.email) {
          setLookup("found")
          setName((prev) => (prev.trim() ? prev : d.name ?? prev))
          setEmail((prev) => (prev.trim() ? prev : d.email ?? prev))
        } else {
          setLookup("new")
        }
      })
      .catch(() => setLookup("idle"))
    return () => ctrl.abort()
  }, [phone])

  const phoneOk = validatePhone(phone).kind === "ok"
  const canSubmit = phoneOk && name.trim().length > 0 && !submitting

  // NOTE: this component is rendered INSIDE the Schedule day-editor's <form>.
  // Nested <form> elements are invalid HTML — the browser silently drops the
  // inner one, so a real <form> here would make the "Add client" button submit
  // the OUTER form (saving the slot) instead of adding the client. We therefore
  // use a <div> and drive submit manually via the button and Enter key.
  const submit = () => {
    if (!canSubmit) return
    onSubmit({
      clientName: name.trim(),
      clientPhone: phone,
      clientEmail: email.trim(),
      clientTelegram: "",
      partySize: Math.max(1, Math.min(partyMax, partySize)),
    })
  }

  const onKeyDownSubmit = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      submit()
    }
  }

  const inputCls =
    "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"

  return (
    // data-add-client-form="open" lets the surrounding day-modal detect an
    // unsubmitted client form when the admin presses the big Save button — so
    // the modal can auto-submit the form first instead of silently discarding
    // the half-typed client.
    <div
      data-add-client-form="open"
      data-add-client-ready={canSubmit ? "true" : "false"}
      className="mt-2 space-y-2.5 bg-gray-50 rounded-xl p-3"
    >
      {/* Phone — first field, full booking-widget behaviour. */}
      <PhoneInput value={phone} onChange={setPhone} inputClassName="text-base" />

      {lookup === "found" ? (
        <p className="text-xs font-medium text-brand -mt-1">Existing client — details filled ✓</p>
      ) : lookup === "loading" ? (
        <p className="text-xs text-gray-400 -mt-1">Looking up…</p>
      ) : null}

      <input
        type="text"
        required
        placeholder="Client name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDownSubmit}
        className={inputCls}
      />
      <input
        type="email"
        placeholder="Email (optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={onKeyDownSubmit}
        className={inputCls}
      />

      {/* How many people this single booking covers (1–6), capped by the seats
          left on the class. Mirrors the public booking widget. */}
      {partyMax > 1 && (
        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1">People</div>
          <div className="flex gap-1.5">
            {Array.from({ length: partyMax }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPartySize(n)}
                className={
                  "flex-1 h-9 rounded-lg text-sm font-semibold border transition-colors " +
                  (partySize === n
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-gray-600 border-gray-200 hover:border-brand/40")
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-white"
        >
          Cancel
        </button>
        <button
          type="button"
          data-add-client-submit
          onClick={submit}
          disabled={!canSubmit}
          className="flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold bg-brand text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add client"}
        </button>
      </div>
    </div>
  )
}
