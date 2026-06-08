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
}

export function AddClientForm({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (c: NewClient) => void
  onCancel: () => void
  submitting?: boolean
}) {
  // Pre-seed with the studios' country code so the "+" and flag show at once.
  const [phone, setPhone] = useState("+62 ")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
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
    })
  }

  const onKeyDownSubmit = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      submit()
    }
  }

  const inputCls =
    "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"

  return (
    <div className="mt-2 space-y-2.5 bg-gray-50 rounded-xl p-3">
      {/* Phone — first field, full booking-widget behaviour. */}
      <PhoneInput value={phone} onChange={setPhone} inputClassName="text-base" />

      {lookup === "found" ? (
        <p className="text-xs font-medium text-[#2C6E49] -mt-1">Existing client — details filled ✓</p>
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
          onClick={submit}
          disabled={!canSubmit}
          className="flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold bg-[#2C6E49] text-white hover:bg-[#1E4D34] disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add client"}
        </button>
      </div>
    </div>
  )
}
