"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { format, startOfMonth, getDaysInMonth, getDay, isBefore, startOfDay, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Clock, Users, CheckCircle, MessageCircle, Loader2 } from "lucide-react"
import { whatsappLink, bookingConfirmationMessage } from "@/lib/whatsapp"
import { WhatsAppIcon } from "@/app/_components/WhatsAppIcon"
import { cn } from "@/lib/utils"
// Phone country table + validation helpers: single source of truth in lib/phone.
import { detectCountry, subscriberDigits, type PhoneCountry } from "@/lib/phone"
import { clientEndTime12, clientEndTime24 } from "@/lib/class-time"
import { formatMoney } from "@/lib/format"

// Deterministic barcode bars derived from a numeric code.
// Returns an array of widths (in px) and gap booleans to render a Code-128-style look.
function generateBarcode(code: string): { width: number; isBar: boolean }[] {
  const seed = code.split("").reduce((acc, d) => acc * 31 + parseInt(d || "0", 10), 7)
  const result: { width: number; isBar: boolean }[] = []
  // Quiet start guard
  result.push({ width: 2, isBar: true }, { width: 1, isBar: false }, { width: 2, isBar: true })
  let s = seed
  for (let i = 0; i < 42; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const w = (s % 3) + 1 // 1..3 px
    result.push({ width: w, isBar: i % 2 === 0 })
  }
  // Guard end
  result.push({ width: 2, isBar: true }, { width: 1, isBar: false }, { width: 2, isBar: true })
  return result
}

const PHONE_FORMATS: Record<string, string> = {
  "+380": "(##) ###-##-##",
  "+375": "(##) ###-##-##",
  "+372": "####-####",
  "+371": "####-####",
  "+370": "(#) ### ####",
  "+971": "## ### ####",
  "+856": "## ### ####",
  "+855": "## ### ###",
  "+852": "#### ####",
  "+66":  "##-####-####",
  "+65":  "####-####",
  "+63":  "### ###-####",
  "+62":  "###-####-####",
  "+61":  "###-###-###",
  "+60":  "##-####-####",
  "+55":  "(##) #####-####",
  "+49":  "### #######",
  "+48":  "###-###-###",
  "+47":  "### ## ###",
  "+46":  "##-###-##-##",
  "+45":  "##-##-##-##",
  "+44":  "#### ######",
  "+43":  "### #######",
  "+41":  "##-###-##-##",
  "+40":  "###-###-###",
  "+39":  "### ### ####",
  "+36":  "##-###-####",
  "+34":  "###-###-###",
  "+33":  "# ##-##-##-##",
  "+32":  "###-##-##-##",
  "+31":  "#-########",
  "+30":  "###-###-####",
  "+27":  "##-###-####",
  "+91":  "#####-#####",
  "+90":  "###-###-##-##",
  "+86":  "###-####-####",
  "+84":  "###-####-###",
  "+82":  "##-####-####",
  "+81":  "##-####-####",
  "+7":   "(###) ###-##-##",
  "+1":   "(###) ###-####",
}

// Mask the FULL template (entered digits + remaining slots) using the
// country's "#" format, keeping separators across the placeholder region too.
function applyMaskFull(chars: string, mask: string): string {
  let result = ""
  let di = 0
  for (let i = 0; i < mask.length && di < chars.length; i++) {
    if (mask[i] === "#") result += chars[di++]
    else result += mask[i]
  }
  if (di < chars.length) result += chars.slice(di)
  return result
}

// In-field phone display: the already-formatted typed value (`typed`), the amber
// "_" placeholder tail for the digits still missing (`tail`), and whether the
// number is complete. Used to render the mask INSIDE the input so the client
// never has to look below the field to see what's left to type.
function phoneFieldDisplay(phone: string, country: PhoneCountry): { typed: string; tail: string; done: boolean } {
  const codeLen = country.code.length - 1
  const sub = phone.replace(/\D/g, "").slice(codeLen)
  const mask = PHONE_FORMATS[country.code]
  const need = Math.max(0, country.min - sub.length)
  const combined = sub + "_".repeat(need)
  const full = country.code + " " + (mask ? applyMaskFull(combined, mask) : combined)
  const typed = formatPhoneInput(phone) // identical to the input's current value
  const tail = full.length > typed.length ? full.slice(typed.length) : ""
  return { typed, tail, done: sub.length >= country.min }
}

function applyMask(digits: string, mask: string): string {
  let result = ""
  let di = 0
  for (let i = 0; i < mask.length; i++) {
    if (di >= digits.length) break
    if (mask[i] === "#") {
      result += digits[di++]
    } else if (di < digits.length) {
      result += mask[i]
    }
  }
  return result
}

function formatPhoneInput(rawDigitsWithPlus: string): string {
  const country = detectCountry(rawDigitsWithPlus)
  if (!country) return rawDigitsWithPlus
  const codeLen = country.code.length - 1
  const sub = rawDigitsWithPlus.replace(/\D/g, "").slice(codeLen)
  if (!sub) return country.code
  const mask = PHONE_FORMATS[country.code]
  return country.code + " " + (mask ? applyMask(sub, mask) : sub)
}

type Slot = {
  id: string
  date: string
  startTime: string
  endTime: string
  classType?: "GROUP" | "KIDS" | "PRIVATE"
  maxCapacity: number
  bookedCount: number
  available: boolean
  bookable?: boolean
  /** Class already finished (end time passed). */
  ended?: boolean
  /** Class currently running (started, not yet finished). */
  started?: boolean
  price?: number
}

type Service = {
  id: string
  name: string
  price: number
}

type Step = "date" | "time" | "details" | "verify" | "done"

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
}

// Price formatting moved to a currency-aware, in-component helper (formatIDR
// below) so the USA / Online studio renders USD while Indonesian studios keep
// the compact "300k IDR" style. Single source: lib/format.formatMoney.

// Client-facing end time (12h) lives in lib/class-time.ts now — single source
// of truth for the "real slot is 2h, client sees 1.5h" rule. Aliased so the
// existing JSX (clientEndTime(...)) keeps working unchanged.
const clientEndTime = clientEndTime12

export default function BookingWidget({ services, studio, studioSlug }: {
  services: Service[]
  studio?: { name: string; slug: string; logoUrl: string | null; locationUrl?: string | null; whatsappEnabled?: boolean; currency?: string; groupPrice?: number; country?: string | null }
  // Slug of the studio this widget books into. Sent as ?studio= on the
  // slots/bookings calls so the API scopes to the right studio regardless of
  // host (we serve every studio from bookgravity.com now). Falls back to the
  // studio prop's slug.
  studioSlug?: string
}) {
  // Query-string suffix that pins API calls to this studio.
  const studioParam = (studioSlug ?? studio?.slug) ? `studio=${encodeURIComponent(studioSlug ?? studio!.slug)}` : ""
  // Currency-aware price formatter: USD for the USA / Online studio, compact
  // IDR for the Indonesian studios. Replaces the old IDR-only formatIDR.
  const formatIDR = (amount: number) => formatMoney(amount, studio?.currency)
  const [step, setStep] = useState<Step>("date")
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [allSlots, setAllSlots] = useState<Slot[]>([])
  const [partySize, setPartySize] = useState(1)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  // Set when the API reports this phone already booked the slot — drives the
  // "are you sure?" confirmation before allowing a duplicate booking.
  const [dupWarn, setDupWarn] = useState<{ existingName: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // WhatsApp confirmation code (anti-spam), now inline on the details step:
  // once the phone is fully entered we send a code, reveal the code field, and
  // only after a correct code do we unlock name/email (and privacy-safely
  // prefill them for returning clients).
  const [otpCode, setOtpCode] = useState("")
  const [otpSending, setOtpSending] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otpVerified, setOtpVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [otpError, setOtpError] = useState("")
  // WhatsApp delivery status of the code we sent (polled): sent → delivered →
  // read, or failed if the number isn't on WhatsApp.
  const [otpDelivery, setOtpDelivery] = useState<"sent" | "delivered" | "read" | "failed">("sent")
  // Only show the code input once we're confident the number is on WhatsApp
  // (delivered, or a fallback timeout with no failure). Until then we show a
  // "checking…" spinner; on failure we ask the client to change the number.
  const [otpReady, setOtpReady] = useState(false)
  const otpFailedRef = useRef(false)
  // The 2-digit code input — auto-focused (and keyboard raised) the moment it
  // appears, so the client just types the code with zero extra taps.
  const otpInputRef = useRef<HTMLInputElement>(null)
  // Whether the (transparent) code input is focused — drives the blinking
  // caret on the active segmented cell.
  const [otpFocused, setOtpFocused] = useState(false)
  // Seconds until "Resend code" re-activates. Starts at 59 each time we send a
  // code; the button is greyed + counts down until it hits 0.
  const [resendIn, setResendIn] = useState(0)
  // Wrapper around the code field — centered in view + the page frozen while
  // the code is pending, so the client never has to scroll to find it.
  const otpScrollRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const fieldRefs = {
    clientName: useRef<HTMLInputElement>(null),
    clientPhone: useRef<HTMLInputElement>(null),
    clientEmail: useRef<HTMLInputElement>(null),
  }
  const [booking, setBooking] = useState<{ id: string; clientName: string; slot: Slot; ticketCode: string; waConfirmationSent?: boolean | null } | null>(null)
  const ticketRef = useRef<HTMLDivElement>(null)

  // Send the ticket to the client's OWN WhatsApp number.
  // We intentionally do NOT use the Web Share API (it opens the system share
  // sheet / contact picker, letting you send to anyone). Instead we save the
  // ticket image to the device and open a wa.me chat pre-targeted to the
  // number used for the booking, with the confirmation text prefilled.
  // Open the client's own WhatsApp chat with the booking details prefilled as
  // text. We intentionally do NOT render/download a PNG (that popped a confusing
  // "download this image?" dialog) — the message already carries the ticket
  // code + details + a link to view it.
  function shareTicketToWhatsApp(_messageText: string, waLink: string | null) {
    if (waLink) window.open(waLink, "_blank")
  }

  const [form, setForm] = useState({
    clientName: "",
    // Pre-fill the leading "+" so the client doesn't have to type it.
    clientPhone: "+",
    clientEmail: "",
  })
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "new">("idle")
  // Informational membership balance for this phone at this studio (0 = none).
  // Clients can't spend a class — this is shown for awareness only; a trainer
  // deducts it at the studio.
  const [membershipLeft, setMembershipLeft] = useState(0)
  // Phone (digits only) we last sent a code to — guards against re-sending.
  const sentDigitsRef = useRef("")
  // Phones already verified in THIS session (digits → verified code + the
  // client details we looked up). Lets "Book another" with the same number
  // skip the WhatsApp code entirely.
  const verifiedClientsRef = useRef<Map<string, { code: string; name: string | null; email: string | null; membership: number }>>(new Map())

  // Send a WhatsApp confirmation code to the entered number, revealing the code
  // field. We deliberately do NOT look the client up here — name/email are only
  // revealed AFTER a correct code (privacy: a phone number alone must not leak
  // someone's details).
  const sendOtp = async (phone: string) => {
    setOtpSending(true)
    setOtpError("")
    setError("")
    setOtpDelivery("sent")
    setOtpReady(false)
    otpFailedRef.current = false
    try {
      const res = await fetch(`/api/otp/send${studioParam ? `?${studioParam}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.skipped) {
        // Studio has no WhatsApp / OTP turned off → no code; unlock fields.
        setOtpSent(false)
        setOtpVerified(true)
        return
      }
      if ((res.ok && data.sent) || res.status === 429) {
        // Sent (or a fresh code already exists) → show the code field and
        // start the 59s resend cooldown.
        setOtpSent(true)
        setResendIn(59)
        return
      }
      // Synchronous failure — Meta refused the number outright (bad format /
      // not reachable). Don't show the code field; tell the client now.
      setOtpSent(false)
      setError(
        data.code === "send_failed"
          ? "We couldn't send a code to that number. Check it's correct and has WhatsApp."
          : data.error || "Couldn't send the code — check the number and try again.",
      )
    } catch {
      setOtpSent(false)
      setError("Couldn't send the code — check the number and try again.")
    } finally {
      setOtpSending(false)
    }
  }

  // Verify the typed code. On success: unlock name/email and privacy-safely
  // prefill them for a returning client.
  const verifyOtp = async (code: string) => {
    setVerifying(true)
    setOtpError("")
    try {
      const res = await fetch(`/api/otp/verify${studioParam ? `?${studioParam}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.clientPhone, code }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setOtpVerified(true)
        const c = data.client as { name: string | null; email: string | null; membershipRemaining?: number } | null
        setMembershipLeft(c?.membershipRemaining ?? 0)
        if (c?.name || c?.email) {
          setLookupState("found")
          setForm((f) => ({ ...f, clientName: c?.name ?? f.clientName, clientEmail: c?.email ?? f.clientEmail }))
        } else {
          setLookupState("new")
        }
        // Remember this number as verified for the rest of the session, so
        // "Book another" with the same phone won't ask for a code again.
        verifiedClientsRef.current.set(form.clientPhone.replace(/\D/g, ""), {
          code,
          name: c?.name ?? null,
          email: c?.email ?? null,
          membership: c?.membershipRemaining ?? 0,
        })
      } else {
        setOtpError(
          data.error === "expired"
            ? "Code expired — tap “Resend code”."
            : data.error === "locked"
              ? "Too many tries — tap “Resend code”."
              : typeof data.remaining === "number"
                ? `Wrong code — ${data.remaining} ${data.remaining === 1 ? "try" : "tries"} left.`
                : "Wrong code.",
        )
      }
    } catch {
      setOtpError("Network error — please try again.")
    } finally {
      setVerifying(false)
    }
  }

  // Auto-send the code the instant the phone is fully entered. If the number
  // changes or becomes incomplete, reset verification + clear any prefilled
  // name/email (privacy). Only on the details step — otherwise navigating back
  // to a restored ticket (step "done", phone restored) would re-send a code.
  useEffect(() => {
    if (step !== "details") return
    const country = detectCountry(form.clientPhone)
    const complete = !!country && subscriberDigits(form.clientPhone, country) >= country.min
    const digits = form.clientPhone.replace(/\D/g, "")
    if (!complete) {
      if (sentDigitsRef.current) {
        sentDigitsRef.current = ""
        setOtpSent(false)
        setOtpVerified(false)
        setOtpReady(false)
        otpFailedRef.current = false
        setOtpCode("")
        setOtpError("")
        setMembershipLeft(0)
        setLookupState("idle")
        setForm((f) => ({ ...f, clientName: "", clientEmail: "" }))
      }
      return
    }
    if (digits === sentDigitsRef.current) return
    sentDigitsRef.current = digits
    setOtpError("")
    setOtpCode("")
    otpFailedRef.current = false
    // Already verified this number this session → skip the code, just unlock +
    // restore the details (and the verified code for the booking call).
    const cached = verifiedClientsRef.current.get(digits)
    if (cached) {
      setOtpSent(false)
      setOtpVerified(true)
      setOtpReady(true)
      setOtpCode(cached.code)
      setMembershipLeft(cached.membership)
      setLookupState(cached.name || cached.email ? "found" : "new")
      setForm((f) => ({ ...f, clientName: cached.name ?? "", clientEmail: cached.email ?? "" }))
      return
    }
    setOtpVerified(false)
    setOtpReady(false)
    setMembershipLeft(0)
    setLookupState("idle")
    setForm((f) => ({ ...f, clientName: "", clientEmail: "" }))
    void sendOtp(form.clientPhone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.clientPhone, step])

  // Poll the code's WhatsApp delivery status. We only reveal the code input
  // once we're confident the number is on WhatsApp:
  //   • delivered/read  → show the code field
  //   • failed          → number isn't on WhatsApp → ask to change it
  //   • still "sent" after a short wait → assume valid (recipient maybe offline)
  useEffect(() => {
    if (!otpSent || otpVerified || otpReady) return
    let tries = 0
    let cancelled = false
    const poll = async () => {
      try {
        const r = await fetch(
          `/api/otp/status?phone=${encodeURIComponent(form.clientPhone)}${studioParam ? `&${studioParam}` : ""}`,
          { cache: "no-store" },
        )
        const d = await r.json().catch(() => ({}))
        if (cancelled || !d.status || d.status === "none") return
        setOtpDelivery(d.status)
        if (d.status === "failed") {
          otpFailedRef.current = true
          setOtpReady(false)
        } else if (d.status === "delivered" || d.status === "read") {
          setOtpReady(true)
        }
      } catch { /* ignore */ }
    }
    void poll()
    const id = setInterval(() => {
      tries++
      void poll()
      // Fallback after ~8s with no failure: a valid number whose phone is just
      // offline still got the code — let them enter it.
      if (tries >= 4 && !otpFailedRef.current) setOtpReady(true)
      if (tries >= 12 || otpFailedRef.current) clearInterval(id)
    }, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [otpSent, otpVerified, otpReady, form.clientPhone, studioParam])

  // The moment the code input appears, focus it (blinking cursor) and raise the
  // keyboard so the client just types the 2 digits. The phone field was focused
  // a moment ago, so on iOS the still-open keyboard simply moves to this field
  // instead of being dismissed (iOS only re-opens the keyboard from a user
  // gesture, but moving it between fields while it's already up is allowed).
  useEffect(() => {
    if (!(otpSent && otpReady && !otpVerified && otpDelivery !== "failed")) return
    const raf = requestAnimationFrame(() => {
      const el = otpInputRef.current
      if (!el) return
      el.focus()
      try { el.setSelectionRange(el.value.length, el.value.length) } catch {}
    })
    return () => cancelAnimationFrame(raf)
  }, [otpSent, otpReady, otpVerified, otpDelivery])

  // While the code is pending (sent, not verified), bring the phone + code
  // into view and FREEZE the page, so the client only sees the number and the
  // code box — no scrolling/hunting. Entering the code (verified) unlocks it
  // and reveals the rest of the form; editing the number is still possible.
  useEffect(() => {
    const pending = step === "details" && otpSent && !otpVerified
    if (!pending) return
    // Center the code box first (the page is still scrollable here)…
    const raf = requestAnimationFrame(() => {
      otpScrollRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    // …then freeze the page so it stays put while they type.
    const lock = setTimeout(() => { document.body.style.overflow = "hidden" }, 450)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(lock)
      document.body.style.overflow = ""
    }
  }, [step, otpSent, otpReady, otpVerified])

  // Tick the resend cooldown down to 0, one second at a time.
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const today = startOfDay(new Date())

  // True once /api/slots has answered at least once. Lets us distinguish
  // "still loading" (skeleton) from "loaded and there's nothing bookable"
  // (empty state). Without this, the empty-state card flashed for ~500 ms
  // on every open before the first month with slots rendered.
  const [slotsLoaded, setSlotsLoaded] = useState(false)

  const fetchAvailableDates = useCallback(async () => {
    // Be defensive: a transient API failure (e.g. during a deploy) can return
    // a non-array error body. Storing that and then calling .filter() on it in
    // render would throw and trip the whole-page error boundary. Guard so a
    // hiccup degrades to the empty state instead of a white screen.
    try {
      const res = await fetch(`/api/slots${studioParam ? `?${studioParam}` : ""}`)
      const data = await res.json()
      setAllSlots(Array.isArray(data) ? data : [])
    } catch {
      setAllSlots([])
    } finally {
      setSlotsLoaded(true)
    }
  }, [studioParam])

  const todayStr = format(today, "yyyy-MM-dd")

  // Future dates that have at least one BOOKABLE slot (passes 2h cutoff) with
  // enough free seats for the party. Without the `bookable` check the calendar
  // shows green dots for days whose only remaining slots are inside the cutoff
  // window — then clicking the day yields an empty list.
  const availableDates = new Set(
    allSlots
      .filter((s) => s.date >= todayStr && s.bookable !== false && (s.maxCapacity - s.bookedCount) >= partySize)
      .map((s) => s.date)
  )
  // Future dates whose bookable slots are all full
  const fullyBookedDates = new Set(
    allSlots
      .filter((s) => s.date >= todayStr && s.bookable !== false && !availableDates.has(s.date))
      .map((s) => s.date)
  )
  // Past dates that had a class scheduled — shown so the user sees there was a session
  // Today/future dates that DO have a class but it can't be booked online
  // (inside the 2h cutoff, or already in progress) — shown greyed so visitors
  // still see "there are classes today" and can message us. Excludes days that
  // are already bookable/full (those have their own state) and classes that
  // have fully finished (`ended`).
  const infoDates = new Set(
    allSlots
      .filter(
        (s) =>
          s.date >= todayStr &&
          s.ended !== true &&
          s.bookable === false &&
          !availableDates.has(s.date) &&
          !fullyBookedDates.has(s.date),
      )
      .map((s) => s.date),
  )
  // Grey "had a class" dot: any day that has slots but nothing bookable or in
  // progress — past days, AND today once all its classes have finished (so the
  // day never looks empty when there genuinely were lessons).
  const historyDates = new Set(
    allSlots
      .map((s) => s.date)
      .filter((d) => !availableDates.has(d) && !fullyBookedDates.has(d) && !infoDates.has(d)),
  )

  useEffect(() => { fetchAvailableDates() }, [fetchAvailableDates])

  // Restore persisted ticket if class date is today or in the future
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bg_active_ticket")
      if (!raw) return
      const saved = JSON.parse(raw) as {
        booking: { id: string; clientName: string; slot: Slot; ticketCode: string }
        selectedDate: string
        partySize: number
        form: { clientName: string; clientPhone: string }
      }
      const classDate = parseISO(saved.selectedDate)
      const todayStart = startOfDay(new Date())
      if (isBefore(classDate, todayStart)) {
        localStorage.removeItem("bg_active_ticket")
        return
      }
      setBooking(saved.booking)
      setSelectedDate(saved.selectedDate)
      setSelectedSlot(saved.booking.slot)
      setPartySize(saved.partySize)
      setForm({ clientName: saved.form.clientName ?? "", clientPhone: saved.form.clientPhone ?? "", clientEmail: "" })
      setStep("done")
    } catch {
      localStorage.removeItem("bg_active_ticket")
    }
  }, [])

  const fetchSlots = useCallback(async (date: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/slots?date=${date}${studioParam ? `&${studioParam}` : ""}`)
      const data = await res.json()
      setSlots(Array.isArray(data) ? data : [])
    } catch {
      setSlots([])
    } finally {
      setLoading(false)
    }
  }, [studioParam])

  const timeStepRef = useRef<HTMLDivElement>(null)

  const handleDateSelect = (date: Date) => {
    const str = format(date, "yyyy-MM-dd")
    setSelectedDate(str)
    // Clear stale slots immediately to avoid the "jump" when previous day's
    // list briefly flashes through before the new one loads.
    setSlots([])
    setSelectedSlot(null)
    setStep("time")
    fetchSlots(str)
    // Smooth scroll the new card into view on the next paint
    requestAnimationFrame(() => {
      timeStepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const handleSlotSelect = (slot: Slot) => {
    if (!slot.available) return
    setSelectedSlot(slot)
    setStep("details")
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}
    if (form.clientName.trim().length < 2) errors.clientName = "Please enter your full name"
    const country = detectCountry(form.clientPhone)
    if (country) {
      const sub = subscriberDigits(form.clientPhone, country)
      if (sub < country.min) {
        errors.clientPhone = `Too few digits for ${country.name} — need ${country.min}, got ${sub}`
      }
    } else {
      const digits = form.clientPhone.replace(/\D/g, "")
      if (!form.clientPhone.startsWith("+") || digits.length < 7) {
        errors.clientPhone = "Enter phone with country code, e.g. +62 812 3456 7890"
      }
    }
    const trimmedEmail = form.clientEmail.trim()
    if (!trimmedEmail) {
      errors.clientEmail = "Please enter your email"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.clientEmail = "Enter a valid email like name@example.com"
    }
    return errors
  }

  const submitBooking = async (confirmDuplicate: boolean, codeOverride?: string) => {
    if (!selectedSlot) return
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch(`/api/bookings${studioParam ? `?${studioParam}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          ...form,
          serviceIds: selectedServices,
          partySize,
          confirmDuplicate,
          otpCode: codeOverride ?? otpCode,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // Soft duplicate warning → show the confirm dialog instead of an error.
        if (err.duplicate) {
          setDupWarn({ existingName: err.existingName ?? null })
          return
        }
        // Code went stale between verify and submit → re-lock + show the hint
        // inline on the details step (no separate verify step anymore).
        if (err.otpError) {
          // The code went stale (e.g. a cached "Book another" code expired).
          // Drop the cached verification and send a fresh code automatically.
          const d = form.clientPhone.replace(/\D/g, "")
          verifiedClientsRef.current.delete(d)
          sentDigitsRef.current = ""
          setOtpVerified(false)
          setOtpReady(false)
          setOtpError(
            err.otpError === "locked"
              ? "Too many tries. We're sending a new code."
              : "That code expired — sending a new one.",
          )
          void sendOtp(form.clientPhone)
          return
        }
        setError(err.error || "Booking failed")
        return
      }

      const data = await res.json()
      setDupWarn(null)
      setOtpError("")
      const bookingData = { id: data.id, clientName: form.clientName, slot: selectedSlot, ticketCode: data.ticketCode }
      setBooking(bookingData)
      // Persist ticket so it survives page reloads until the class is in the past
      try {
        const persisted = {
          booking: bookingData,
          selectedDate,
          partySize,
          form: { clientName: form.clientName, clientPhone: form.clientPhone },
        }
        localStorage.setItem("bg_active_ticket", JSON.stringify(persisted))
      } catch {}
      setStep("done")
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSlot) return
    // The phone is already verified inline (otpVerified) before the fields
    // unlock, so Continue just validates name/email and creates the booking.
    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const firstKey = Object.keys(errors)[0] as keyof typeof fieldRefs
      fieldRefs[firstKey]?.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      fieldRefs[firstKey]?.current?.focus()
      return
    }
    setFieldErrors({})
    submitBooking(false)
  }

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) setFieldErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
  }

  // Months ("yyyy-MM") that have at least one bookable date with seats for the
  // party. Empty months are skipped entirely: the month chevrons hop only
  // between months that actually have bookable dates, and the first view is
  // the nearest such month.
  const monthsWithBookable = new Set<string>()
  for (const d of availableDates) monthsWithBookable.add(d.slice(0, 7))
  // Also keep months that only have not-yet-finished, non-bookable classes
  // (e.g. today's class inside the cutoff) so the calendar still lands there
  // and doesn't show "no dates available".
  for (const d of infoDates) monthsWithBookable.add(d.slice(0, 7))
  const sortedBookableMonths = Array.from(monthsWithBookable).sort()
  const hasAnyBookable = sortedBookableMonths.length > 0

  // Render the day grid for a "yyyy-MM" key (no month title — that lives in
  // the chevron header). Kept as a closure so it reads the date sets / handlers
  // from this scope without prop plumbing.
  const renderMonthGrid = (monthKey: string) => {
    const [y, m] = monthKey.split("-").map(Number)
    const monthDate = new Date(y, m - 1, 1)
    const daysInMonth = getDaysInMonth(monthDate)
    // Week starts Monday: Mon=0 … Sun=6
    const firstDayOfWeek = (getDay(startOfMonth(monthDate)) + 6) % 7
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(y, m - 1, i + 1))
    const blanks = Array.from({ length: firstDayOfWeek })
    return (
      <div key={monthKey}>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-gray-700 py-2 uppercase tracking-wider">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {blanks.map((_, i) => <div key={`b${i}`} />)}
          {days.map((day) => {
            const str = format(day, "yyyy-MM-dd")
            const isPast = isBefore(day, today)
            const hasSlot = availableDates.has(str)
            const isFull = fullyBookedDates.has(str)
            // Had a class but nothing actionable now (past day, or today's
            // classes already finished) → grey dot so the day isn't blank.
            const hadClass = historyDates.has(str)
            // Has a class today/soon that can't be booked online (cutoff / in
            // progress) — still selectable so the visitor can see it greyed.
            const hasInfo = infoDates.has(str)
            const clickable = (hasSlot || hasInfo) && !isPast

            // No persistent "selected day" highlight: tapping a date advances
            // straight to the time step, and going back shouldn't leave it
            // filled. Days just show their availability dot.
            const dotColor = hasSlot
              ? "bg-brand"
              : hasInfo
                ? "bg-amber-400"
                : isFull && !isPast
                  ? "bg-rose-500"
                  : hadClass
                    ? "bg-gray-300"
                    : null
            return (
              <button
                key={str}
                type="button"
                onClick={() => clickable && handleDateSelect(day)}
                aria-disabled={!clickable}
                className={cn(
                  "aspect-square rounded-full text-sm font-medium flex flex-col items-center justify-center gap-1 leading-none",
                  hasSlot
                    ? "text-gray-900 hover:bg-brand/10 cursor-pointer"
                    : hasInfo
                      ? "text-gray-700 hover:bg-amber-400/10 cursor-pointer"
                      : isFull && !isPast
                        ? "text-gray-500 cursor-not-allowed"
                        : isPast
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-gray-700 cursor-not-allowed",
                )}
              >
                <span>{day.getDate()}</span>
                {/* Fixed-height dot row keeps every cell the same size. */}
                <span className="h-1.5 flex items-center" aria-hidden>
                  {dotColor && <span className={cn("w-1.5 h-1.5 rounded-full", dotColor)} />}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Month navigation hops only between months that have bookable dates. If the
  // current view has none (e.g. visitor lands in an empty May), jump to the
  // nearest future bookable month once slot data has loaded.
  const currentKey = format(currentMonth, "yyyy-MM")
  const todayKey = format(today, "yyyy-MM")
  useEffect(() => {
    if (allSlots.length === 0) return
    if (monthsWithBookable.has(currentKey)) return
    const future = sortedBookableMonths.find((k) => k >= todayKey) ?? sortedBookableMonths[0]
    if (future) {
      const [y, m] = future.split("-").map(Number)
      setCurrentMonth(new Date(y, m - 1, 1))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSlots.length, currentKey, todayKey])

  // Navigation is capped at TWO months: the nearest bookable month and the
  // single month after it. No paging three+ months ahead — only those two are
  // ever reachable.
  const reachableMonths = sortedBookableMonths.slice(0, 2)
  const reachableIdx = reachableMonths.indexOf(currentKey)
  const prevBookableKey = reachableIdx > 0 ? reachableMonths[reachableIdx - 1] : undefined
  const nextBookableKey =
    reachableIdx >= 0 && reachableIdx < reachableMonths.length - 1
      ? reachableMonths[reachableIdx + 1]
      : undefined
  const goToMonth = (key: string) => {
    const [y, m] = key.split("-").map(Number)
    setCurrentMonth(new Date(y, m - 1, 1))
  }

  // Beautiful ticket on done step
  if (step === "done" && booking) {
    const barcodeBars = generateBarcode(booking.ticketCode)
    const dateStr = selectedDate ? format(parseISO(selectedDate), "EEE, MMM d") : ""
    const timeStr = formatTime(booking.slot.startTime)
    const messageText = bookingConfirmationMessage({
      clientName: form.clientName,
      date: dateStr,
      time: timeStr,
      ticketCode: booking.ticketCode,
      partySize,
      studioName: studio?.name,
      locationUrl: studio?.locationUrl ?? null,
    })
    const waLink = form.clientPhone ? whatsappLink(form.clientPhone, messageText) : null

    // Return to the start of the booking flow (used by the top Back button and
    // the bottom "Book another session" button).
    const goToStart = () => {
      try { localStorage.removeItem("bg_active_ticket") } catch {}
      setStep("date")
      setSelectedDate(null)
      setSelectedSlot(null)
      setForm({ clientName: "", clientPhone: "+", clientEmail: "" })
      setSelectedServices([])
      setBooking(null)
      setPartySize(1)
      setOtpCode("")
      setOtpError("")
      fetchAvailableDates()
    }

    return (
      // items-start (not center) so a tall ticket scrolls from the top instead
      // of having its edges clipped; my-auto still centers a short ticket.
      <div className="fixed inset-0 bg-gradient-to-br from-sand via-[#EFEEE8] to-[#E8E6DD] z-50 flex items-start justify-center p-4 overflow-y-auto">
        {/* Always-visible Back control — pinned to the top-left so the user can
            return to the schedule without scrolling to the bottom button. */}
        <button
          onClick={goToStart}
          className="fixed top-4 left-4 z-10 inline-flex items-center gap-1 bg-white/85 backdrop-blur-sm border border-gray-200 text-gray-700 hover:bg-white px-3 py-2 rounded-full text-sm font-medium shadow-sm"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="w-full max-w-sm my-auto">
          {/* Ticket card */}
          <div ref={ticketRef} className="bg-white rounded-3xl shadow-2xl relative overflow-hidden">
            {/* Top accent bar */}
            <div className="h-1.5 bg-gradient-to-r from-brand via-[#3a8a5d] to-brand"></div>

            {/* Header with logo */}
            <div className="px-6 pt-6 pb-5 text-center">
              <div className="flex justify-center mb-3">
                <div className="w-20 h-20 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center shadow-sm overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={studio?.logoUrl || "/api/app-icon"} alt={studio?.name || "Gravity Stretching"} className="w-16 h-16 object-contain" />
                </div>
              </div>

              {/* Confirmed badge */}
              <div className="inline-flex items-center gap-1.5 bg-brand/10 text-brand px-3 py-1 rounded-full mb-3">
                <CheckCircle size={13} />
                <span className="text-[11px] font-bold uppercase tracking-wider">Booking confirmed</span>
              </div>

              <h2 className="text-xl font-bold text-gray-900 mb-0.5">{booking.clientName}</h2>
              <p className="text-xs text-gray-400 uppercase tracking-widest">
                {partySize > 1 ? `${partySize} spots reserved` : "1 spot reserved"}
              </p>
            </div>

            {/* Slot info row */}
            <div className="mx-6 grid grid-cols-2 gap-3 pb-5">
              <div className="bg-[#F8F7F3] rounded-xl p-3 text-center">
                <div className="text-[9px] uppercase text-gray-400 tracking-wider mb-1 font-semibold">Date</div>
                <div className="text-sm font-bold text-gray-900">{dateStr}</div>
              </div>
              <div className="bg-[#F8F7F3] rounded-xl p-3 text-center">
                <div className="text-[9px] uppercase text-gray-400 tracking-wider mb-1 font-semibold">Time</div>
                <div className="text-sm font-bold text-gray-900">{timeStr}</div>
              </div>
            </div>

            {/* Membership balance (informational) - a returning client with an
                active pass sees how many classes are left, same as on the
                booking step. Hidden when there's no active membership. */}
            {membershipLeft > 0 && (
              <div className="mx-6 mb-5 -mt-1 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2.5 text-center text-xs text-brand">
                🎟️ {membershipLeft} {membershipLeft === 1 ? "class" : "classes"} left on your membership
              </div>
            )}

            {/* Perforated divider */}
            <div className="relative">
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-sand rounded-full"></div>
              <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-sand rounded-full"></div>
              <div className="mx-6 border-t-2 border-dashed border-gray-200"></div>
            </div>

            {/* Stub with barcode and code */}
            <div className="px-6 pt-5 pb-6 text-center">
              {/* Cash payment notice */}
              {(() => {
                const perPerson = booking.slot.price ?? 300000
                const sessionTotal = perPerson * partySize
                const chosenServices = services.filter((s) => selectedServices.includes(s.id))
                const servicesTotal = chosenServices.reduce((sum, s) => sum + s.price, 0)
                const total = sessionTotal + servicesTotal
                return (
                  <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
                    <div className="text-[9px] uppercase tracking-[0.25em] text-amber-700 font-bold mb-0.5">
                      Pay at the studio
                    </div>
                    <div className="text-sm font-semibold text-amber-900">
                      <span className="text-base font-bold">{formatIDR(total)}</span>
                    </div>
                    <div className="text-[10px] text-amber-700/80 mt-0.5">
                      Cash · Card · QR · Transfer
                    </div>
                    {(partySize > 1 || chosenServices.length > 0) && (
                      <div className="mt-1.5 pt-1.5 border-t border-amber-200/60 space-y-0.5 text-[10px] text-amber-700/80">
                        <div className="flex justify-between">
                          <span>Session {partySize > 1 ? `(${formatIDR(perPerson)} × ${partySize})` : ""}</span>
                          <span>{formatIDR(sessionTotal)}</span>
                        </div>
                        {chosenServices.map((s) => (
                          <div key={s.id} className="flex justify-between">
                            <span>+ {s.name}</span>
                            <span>{formatIDR(s.price)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              <div className="text-[10px] uppercase tracking-[0.3em] text-gray-400 mb-2 font-semibold">
                Show this code to your trainer
              </div>

              {/* Big code */}
              <div className="text-5xl font-bold tracking-[0.4em] text-gray-900 mb-4 font-mono">
                {booking.ticketCode}
              </div>

              {/* Barcode */}
              <div className="flex justify-center items-end h-14 gap-px mb-1">
                {barcodeBars.map((b, i) => (
                  <div
                    key={i}
                    style={{ width: `${b.width}px` }}
                    className={`h-full ${b.isBar ? "bg-gray-900" : "bg-transparent"}`}
                  />
                ))}
              </div>
              <div className="text-[10px] tracking-[0.5em] text-gray-400 font-mono">
                GRV-{booking.ticketCode}
              </div>
            </div>

            {/* Brand footer */}
            <div className="bg-[#F8F7F3] px-6 py-4 text-center border-t border-gray-100">
              <div className="text-base font-bold text-brand tracking-tight">{studio?.name || "Gravity Stretching"}</div>
            </div>
          </div>

          {/* Reminder tip */}
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 mt-3 text-center">
            <p className="text-sm font-semibold text-gray-800 mb-1">Please arrive 10 minutes early 🧘</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Bring water, wear comfortable clothing.<br/>
              We can&apos;t wait to see you on the mat 🌿
            </p>
          </div>

          {/* Actions */}
          <div className="mt-4 space-y-2">
            {/* Add to calendar — Google Calendar template URL with the
                client-facing 90-min range, local "floating" time (clients book
                in the studio's own timezone). */}
            {(() => {
              const d = booking.slot.date.replace(/-/g, "")
              const t = (hhmm: string) => hhmm.replace(":", "") + "00"
              const calUrl =
                "https://calendar.google.com/calendar/render?action=TEMPLATE" +
                `&text=${encodeURIComponent(`Stretching class — ${studio?.name || "Gravity Stretching"}`)}` +
                `&dates=${d}T${t(booking.slot.startTime)}/${d}T${t(clientEndTime24(booking.slot.startTime))}` +
                `&details=${encodeURIComponent(`Ticket ${booking.ticketCode}. Arrive 10 minutes early. Booked at bookgravity.com/${studioSlug}`)}` +
                (studio?.locationUrl ? `&location=${encodeURIComponent(studio.locationUrl)}` : "")
              return (
                <a
                  href={calUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-brand text-gray-700 py-3 rounded-xl text-sm font-medium transition-colors"
                >
                  <Clock size={15} className="text-brand" />
                  Add to calendar
                </a>
              )
            })()}
            {/* Honest delivery status: the API reports whether the WhatsApp
                confirmation was accepted. If it failed, say so and offer the
                manual send — a silent miss used to leave clients without any
                confirmation (audit 2026-06-12). */}
            {booking?.waConfirmationSent === false && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-700">
                We couldn&apos;t deliver the confirmation to your WhatsApp — your spot is
                still booked. Save this ticket or send it to us below.
              </div>
            )}
            {/* "Send to WhatsApp" only for studios WITHOUT WhatsApp — those WITH
                it already auto-send the ticket to the client's WhatsApp. The
                failed-delivery case above re-enables it as a fallback. */}
            {waLink && (!studio?.whatsappEnabled || booking?.waConfirmationSent === false) && (
              <button
                onClick={() => shareTicketToWhatsApp(messageText, waLink)}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1da851] text-white py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                <MessageCircle size={16} />
                Send to WhatsApp
              </button>
            )}

            <button
              onClick={goToStart}
              className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 py-3 rounded-xl text-sm font-medium transition-colors"
            >
              Book another session
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Compact step indicator — just three dots with the current one
          highlighted. No labels, no big circles, no connectors taking up
          vertical space. Clicking a completed step jumps back. */}
      {(() => {
        const stepList = ["date", "time", "details"] as Step[]
        // "verify" is part of the details phase → keep the last dot active.
        const currentIdx = step === "done" ? 3 : step === "verify" ? 2 : stepList.indexOf(step)
        const canNavigateTo = (s: Step) => {
          const targetIdx = stepList.indexOf(s)
          if (targetIdx >= currentIdx) return false
          if (s === "time") return !!selectedDate
          if (s === "details") return !!selectedSlot
          return true
        }
        return (
          <div className="flex items-center justify-center gap-1.5 mb-3">
            {stepList.map((s, i) => {
              const isCompleted = currentIdx > i
              const isCurrent = currentIdx === i
              const clickable = canNavigateTo(s)
              return (
                <button
                  key={s}
                  onClick={() => clickable && setStep(s)}
                  disabled={!clickable}
                  aria-label={`Step ${i + 1}`}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    isCurrent ? "w-6 bg-brand" : isCompleted ? "w-1.5 bg-brand" : "w-1.5 bg-gray-300",
                    clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"
                  )}
                />
              )
            })}
          </div>
        )
      })()}

      {/* Step: Date */}
      {step === "date" && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          {/* Group class summary — two fixed zones so nothing reflows when the
              count changes: (1) class + price header, (2) party-size stepper.
              The two rows never compete for horizontal space, and the count has
              a fixed width, so the card stays put on every phone width. */}
          <div className="bg-brand/[0.07] border border-brand/15 rounded-2xl mb-4 overflow-hidden">
            {/* Header: class label + details (left), price (right) */}
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-brand leading-none">Group class</div>
                <div className="text-[11px] text-gray-500 mt-1.5 leading-none">{(studio?.country || "").toUpperCase() === "US" ? "Live online · small group" : "Up to 6 people · 1.5 hours"}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-2xl font-bold text-brand leading-none tabular-nums">{formatIDR(studio?.groupPrice ?? 300000)}</div>
                <div className="text-[10px] text-gray-500 mt-1.5 uppercase tracking-wide leading-none">per person</div>
              </div>
            </div>

            {/* Stepper row on its own line, divided from the header */}
            <div className="px-4 py-2.5 border-t border-brand/12 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-600">How many people?</span>
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setPartySize(Math.max(1, partySize - 1))}
                  disabled={partySize <= 1}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl text-brand hover:bg-brand/10 active:bg-brand/15 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                  aria-label="Decrease people"
                >
                  −
                </button>
                <span className="w-8 text-center font-bold text-lg text-gray-900 tabular-nums leading-none">{partySize}</span>
                <button
                  type="button"
                  onClick={() => setPartySize(Math.min(6, partySize + 1))}
                  disabled={partySize >= 6}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl text-brand hover:bg-brand/10 active:bg-brand/15 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                  aria-label="Increase people"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {slotsLoaded && !hasAnyBookable ? (
            // Loaded, confirmed no bookable dates anywhere.
            <div className="text-center py-12 px-4">
              <div className="text-4xl mb-3">📅</div>
              <div className="text-base font-semibold text-gray-800">No dates available for booking</div>
              <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
                Looks like the schedule isn&apos;t published yet. Check back soon or message us.
              </p>
            </div>
          ) : (
            // Calendar renders INSTANTLY (today's month) and the availability
            // dots fill in lazily once /api/slots resolves — so it feels snappy
            // instead of showing a blank skeleton. Chevrons stay disabled until
            // data lands, then hop between the (max two) bookable months.
            <>
              <div className="flex items-center justify-between mb-5">
                <button
                  type="button"
                  onClick={() => prevBookableKey && goToMonth(prevBookableKey)}
                  disabled={!prevBookableKey}
                  aria-label="Previous month"
                  className={cn("p-2 rounded-full hover:bg-gray-100 transition-colors", !prevBookableKey && "opacity-30 cursor-not-allowed")}
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 className="text-lg font-semibold text-gray-800">
                  {format(currentMonth, "MMMM yyyy")}
                </h2>
                <button
                  type="button"
                  onClick={() => nextBookableKey && goToMonth(nextBookableKey)}
                  disabled={!nextBookableKey}
                  aria-label="Next month"
                  className={cn("p-2 rounded-full hover:bg-gray-100 transition-colors", !nextBookableKey && "opacity-30 cursor-not-allowed")}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {renderMonthGrid(currentKey)}

              {slotsLoaded ? (
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-4 text-xs">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                    <span>Available</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    <span>Booked</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    <span>Past class</span>
                  </div>
                </div>
              ) : (
                <div className="text-center mt-4 text-xs text-gray-400 animate-pulse">
                  Loading available dates…
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step: Time */}
      {step === "time" && selectedDate && (
        <div ref={timeStepRef} className="bg-white rounded-2xl shadow-sm p-6 scroll-mt-4 min-h-[320px]">
          <button onClick={() => setStep("date")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
            <ChevronLeft size={16} /> Back
          </button>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">
            {format(parseISO(selectedDate), "EEEE, MMMM d")}
          </h2>
          <p className="text-sm text-gray-400 mb-6">Select a time that works for you</p>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No sessions available on this day</div>
          ) : (() => {
            const anyBookable = slots.some((s) => s.available && s.bookable !== false && (s.maxCapacity - s.bookedCount) >= partySize)
            return (
              <>
                {!anyBookable && (
                  <div className="mb-4 rounded-2xl border-2 border-rose-100 bg-rose-50/60 p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                      <Users size={18} className="text-rose-500" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-rose-900 mb-0.5">
                        {slots.every((s) => !s.available) ? "All groups are fully booked" : "Not enough spots for your party"}
                      </div>
                      <div className="text-xs text-rose-700/80 leading-relaxed">
                        {slots.every((s) => !s.available)
                          ? "Every session on this day is sold out. Please pick another day from the calendar."
                          : `You need ${partySize} spots — none of the groups today have that many seats left.`}
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  {slots.map((slot) => {
                    const spotsLeft = slot.maxCapacity - slot.bookedCount
                    const enoughForParty = spotsLeft >= partySize
                    // Slot is inside the 2-hour cutoff: still shown, but greyed
                    // out and not bookable online — the client can contact us.
                    const withinCutoff = slot.bookable === false
                    const isFull = !slot.available
                    const canBook = slot.available && enoughForParty && !withinCutoff
                    return (
                      <button
                        key={slot.id}
                        onClick={() => canBook && handleSlotSelect(slot)}
                        disabled={!canBook}
                        className={cn(
                          "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left relative",
                          canBook
                            ? "border-gray-100 hover:border-brand hover:bg-brand/5 cursor-pointer"
                            : withinCutoff
                              ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                              : isFull
                                ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                                : "border-amber-100 bg-amber-50/40 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                            canBook ? "bg-brand/10" : withinCutoff ? "bg-gray-200" : isFull ? "bg-gray-200" : "bg-amber-100"
                          )}>
                            <Clock size={18} className={canBook ? "text-brand" : withinCutoff ? "text-gray-400" : isFull ? "text-gray-400" : "text-amber-600"} />
                          </div>
                          <div className="min-w-0">
                            <div className={cn("font-semibold flex items-center gap-2 flex-wrap", isFull ? "text-gray-400" : withinCutoff ? "text-gray-500" : "text-gray-800")}>
                              <span>{formatTime(slot.startTime)} – {clientEndTime(slot.startTime)}</span>
                              {(() => {
                                const label = slot.classType === "KIDS" ? "Kids" : slot.classType === "PRIVATE" ? "Private" : "Group"
                                // Sold-out cards fade everything to pale grey;
                                // otherwise each class type keeps its colour.
                                const color = isFull
                                  ? "bg-gray-200 text-gray-400"
                                  : slot.classType === "KIDS"
                                    ? "bg-amber-100 text-amber-700"
                                    : slot.classType === "PRIVATE"
                                      ? "bg-purple-100 text-purple-700"
                                      : "bg-brand/10 text-brand"
                                return (
                                  <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full no-underline", color)}>
                                    {label}
                                  </span>
                                )
                              })()}
                            </div>
                            <div className={cn("text-sm", withinCutoff ? "text-gray-400" : "text-gray-400")}>
                              {withinCutoff
                                ? slot.started
                                  ? "Class in progress"
                                  : "Online booking closed — message us to join"
                                : slot.classType === "PRIVATE"
                                  ? "Private session · 1 person"
                                  : slot.classType === "KIDS"
                                    ? `Kids class · up to ${slot.maxCapacity}`
                                    : `Group class · up to ${slot.maxCapacity}`}
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-0.5">
                          {withinCutoff ? (
                            <span className={cn(
                              "inline-flex items-center justify-center px-2.5 h-5 rounded-full text-[10px] font-bold uppercase tracking-wide leading-none",
                              slot.started ? "bg-brand text-white" : "bg-gray-300 text-gray-600",
                            )}>{slot.started ? "Live" : "Closed"}</span>
                          ) : isFull ? (
                            <span className="inline-flex items-center justify-center px-2.5 h-5 rounded-full text-[10px] font-bold uppercase tracking-wide leading-none bg-rose-500 text-white">Sold out</span>
                          ) : !enoughForParty ? (
                            <span className="inline-flex items-center justify-center px-2.5 h-5 rounded-full text-[10px] font-bold uppercase tracking-wide leading-none bg-amber-500 text-white">{`Only ${spotsLeft} left`}</span>
                          ) : (
                            <div className="flex items-center gap-1 text-sm font-medium text-brand">
                              <Users size={14} />
                              {spotsLeft} / {slot.maxCapacity} spots
                            </div>
                          )}
                          <div className={cn(
                            "text-[11px] mt-0.5",
                            canBook ? "text-brand/70" : withinCutoff ? "text-gray-400" : isFull ? "text-rose-500 font-semibold" : "text-amber-600/70"
                          )}>
                            {withinCutoff ? "Within 2h of start" : isFull ? `${slot.bookedCount}/${slot.maxCapacity} booked` : canBook ? "Available" : `${spotsLeft} free`}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* Step: Details */}
      {step === "details" && selectedSlot && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <button onClick={() => setStep("time")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
            <ChevronLeft size={16} /> Back
          </button>

          <div className="bg-brand/5 rounded-xl p-4 mb-6">
            <div className="font-semibold text-gray-800">
              {selectedDate && format(parseISO(selectedDate), "EEEE, MMMM d")}
            </div>
            <div className="text-sm text-gray-500">
              {formatTime(selectedSlot.startTime)} – {clientEndTime(selectedSlot.startTime)} · Group class
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {(() => {
              const country = detectCountry(form.clientPhone)
              const digits = form.clientPhone.replace(/\D/g, "")
              // Unknown code = typed more than the max code length (3 digits after +) but still no match
              const unknownCode = !country && digits.length > 3
              const hasError = !!fieldErrors.clientPhone || unknownCode
              const display = country ? phoneFieldDisplay(form.clientPhone, country) : null
              const done = !!display?.done
              // Right-side adornments inside the phone field: a spinner while
              // sending, a green WhatsApp badge once the code is delivered (so
              // it's obvious the code went to WhatsApp), or a ⚠️ if not on WA.
              const showWaBadge = otpSent && otpReady && otpDelivery !== "failed"
              const rightPad =
                otpSending ||
                (otpSent && !otpReady && otpDelivery !== "failed") ||
                showWaBadge ||
                (otpDelivery === "failed" && !otpVerified)
              return (
                <div>
                  {/* Label row: the country + amber/green status sits right next
                      to the field (not far below), turning green with a ✓ when
                      the number is complete. */}
                  <div className="flex items-center justify-between mb-1">
                    {/* WhatsApp studios confirm the booking via a WhatsApp code,
                        so the label makes explicit the number must be on WA. */}
                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                      {studio?.whatsappEnabled ? (
                        <>
                          Phone with <WhatsAppIcon size={15} /> WhatsApp *
                        </>
                      ) : (
                        "Phone *"
                      )}
                    </label>
                    {country && (
                      <span className={cn("text-xs font-medium flex items-center gap-1", done ? "text-brand" : "text-amber-600")}>
                        {country.flag} {country.name}{done && " ✓"}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      ref={fieldRefs.clientPhone}
                      type="tel"
                      autoFocus
                      value={form.clientPhone}
                      onChange={(e) => {
                        const stripped = "+" + e.target.value.replace(/\D/g, "")
                        const c = detectCountry(stripped)
                        if (!c && stripped.replace(/\D/g, "").length > 3) return
                        if (c && subscriberDigits(stripped, c) > c.max) return
                        const formatted = c ? formatPhoneInput(stripped) : stripped
                        setForm({ ...form, clientPhone: formatted })
                        clearFieldError("clientPhone")
                      }}
                      placeholder="+62 812 3456 7890"
                      // Real text is transparent while we draw the masked overlay
                      // (so typed digits + amber _ placeholders show inside the
                      // field); the caret stays visible via caret-color.
                      // Dial-pad-style digits: 20px semibold reads as confident
                      // and solid (24px at regular weight looked spindly). The
                      // overlay below MUST mirror size/weight/padding to align.
                      className={cn(
                        "w-full border rounded-xl px-4 py-3 text-xl font-semibold tabular-nums focus:outline-none focus:ring-2 transition-colors caret-brand",
                        display && form.clientPhone ? "text-transparent" : "text-gray-900",
                        rightPad && "pr-11",
                        hasError
                          ? "border-red-400 focus:ring-red-200 focus:border-red-400 bg-red-50"
                          : "border-gray-200 focus:ring-brand/30 focus:border-brand"
                      )}
                    />
                    {display && form.clientPhone && (
                      <div className={cn(
                        "absolute inset-0 px-4 py-3 text-xl font-semibold tabular-nums flex items-center pointer-events-none whitespace-pre",
                        rightPad && "pr-11",
                      )}>
                        <span className="text-gray-900">{display.typed}</span>
                        <span className="text-amber-500">{display.tail}</span>
                      </div>
                    )}
                    {/* Sending the WhatsApp code — a spinner at the field's edge so
                        the client knows something is happening in the 1–2s wait. */}
                    {(otpSending || (otpSent && !otpReady && !otpVerified && otpDelivery !== "failed")) && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand pointer-events-none" aria-label="Checking WhatsApp">
                        <Loader2 size={20} className="animate-spin" />
                      </div>
                    )}
                    {otpDelivery === "failed" && !otpVerified && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 pointer-events-none" aria-label="Not on WhatsApp">
                        <span className="text-lg">⚠️</span>
                      </div>
                    )}
                    {/* Code delivered → WhatsApp badge so it's obvious the code
                        went to this number's WhatsApp. Auto-hides when the
                        number is edited (the OTP state resets). */}
                    {showWaBadge && (
                      <div
                        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-label="Code sent to this WhatsApp number"
                      >
                        <svg viewBox="0 0 24 24" className="w-6 h-6" role="img" aria-hidden>
                          <path
                            fill="#25D366"
                            d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  {fieldErrors.clientPhone ? (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.clientPhone}</p>
                  ) : unknownCode ? (
                    <p className="text-xs text-red-500 mt-1">Unknown country code — please start with a valid code, e.g. +62</p>
                  ) : !country ? (
                    <p className="text-xs text-gray-400 mt-1">Start with country code, e.g. +62 for Indonesia</p>
                  ) : null}
                </div>
              )
            })()}

            {/* Checking delivery — the code field stays hidden until we know
                the number is on WhatsApp. */}
            {otpSent && !otpReady && !otpVerified && otpDelivery !== "failed" && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-brand" />
                Sending a code to your WhatsApp… usually takes a few seconds.
              </div>
            )}

            {/* Number isn't on WhatsApp → ask to change it; no code field. */}
            {otpSent && !otpReady && !otpVerified && otpDelivery === "failed" && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                <span className="font-semibold">⚠️ This number isn&apos;t on WhatsApp.</span>{" "}
                Please change the number above to one that has WhatsApp — then we&apos;ll send the code.
              </div>
            )}

            {/* WhatsApp code — only once we know the number is on WhatsApp. */}
            {otpSent && otpReady && !otpVerified && (
              <div ref={otpScrollRef} className="flex flex-col items-center gap-3 py-1 scroll-mt-24">
                {/* 2-digit code: two airy slots, each a big digit over an
                    underline. The underline UNDER the slot you type next blinks
                    green; no separator dash. A transparent input over the slots
                    drives the state + keyboard. */}
                <div
                  className={cn(
                    "relative inline-flex cursor-text items-center rounded-2xl border-2 bg-white px-6 py-3 shadow-sm transition-colors duration-200",
                    otpError
                      ? "border-red-400"
                      : otpFocused
                        ? "border-brand ring-4 ring-brand/15"
                        : "border-gray-300",
                  )}
                  onClick={() => otpInputRef.current?.focus()}
                >
                  <input
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={2}
                    value={otpCode}
                    disabled={verifying}
                    onFocus={() => setOtpFocused(true)}
                    onBlur={() => setOtpFocused(false)}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 2)
                      setOtpCode(v)
                      setOtpError("")
                      if (v.length === 2 && !verifying) verifyOtp(v)
                    }}
                    aria-label="Confirmation code (2 digits)"
                    className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-text disabled:cursor-default"
                  />
                  <div className="flex items-end justify-center gap-6 px-2" aria-hidden>
                    {[0, 1].map((i) => {
                      const digit = otpCode[i] ?? ""
                      const active = otpFocused && !verifying && otpCode.length === i
                      return (
                        <div key={i} className="flex flex-col items-center gap-2.5">
                          <span
                            className={cn(
                              "flex h-11 w-9 items-center justify-center text-4xl font-bold leading-none tabular-nums transition-colors duration-200",
                              otpError ? "text-red-600" : "text-[#1f5236]",
                            )}
                          >
                            {digit || " "}
                          </span>
                          <span
                            className={cn(
                              "h-1 w-9 rounded-full transition-colors duration-200",
                              otpError
                                ? "bg-red-400"
                                : active
                                  ? "animate-caret bg-brand"
                                  : digit
                                    ? "bg-brand/60"
                                    : "bg-gray-200",
                            )}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => sendOtp(form.clientPhone)}
                  disabled={otpSending || resendIn > 0}
                  className={cn(
                    "text-xs font-medium",
                    resendIn > 0 || otpSending
                      ? "text-gray-400 cursor-not-allowed"
                      : "text-brand hover:underline",
                  )}
                >
                  {otpSending
                    ? "Sending…"
                    : resendIn > 0
                      ? `Resend code in 0:${String(resendIn).padStart(2, "0")}`
                      : "Resend code"}
                </button>
              </div>
            )}
            {otpVerified && (
              <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm font-medium text-brand flex items-center gap-2">
                <span>✓</span> Number verified
              </div>
            )}

            {/* Everything below stays hidden until the WhatsApp code is
                verified — so while entering the code only the phone + code are
                on screen. Verifying reveals the rest (the number stays editable
                above the whole time). */}
            {otpVerified && (<div className="space-y-4">
            {/* Informational membership balance — clients can't spend a class
                here; a trainer deducts it at the studio. Shown once the code is
                verified and the client has an active pass at this studio. */}
            {membershipLeft > 0 && (
              <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-brand">
                🎟️ You have <span className="font-semibold">{membershipLeft}</span>{" "}
                {membershipLeft === 1 ? "class" : "classes"} left on your membership.{" "}
                <span className="text-brand/70">Your trainer will check you in at the studio.</span>
              </div>
            )}

            {(() => {
              // Name + email stay locked until the WhatsApp code is verified
              // (privacy: a phone number alone must not reveal anyone's details).
              const phoneDone = otpVerified
              return (
                <div>
                  <label className={cn(
                    "block text-sm font-medium mb-1",
                    phoneDone ? "text-gray-700" : "text-gray-400"
                  )}>
                    Email *
                    {lookupState === "loading" && <span className="text-xs text-gray-400 ml-2">looking up…</span>}
                    {lookupState === "found" && form.clientEmail && <span className="text-xs text-brand ml-2">welcome back ✓</span>}
                  </label>
                  <input
                    ref={fieldRefs.clientEmail}
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    disabled={!phoneDone}
                    value={form.clientEmail}
                    onChange={(e) => { setForm({ ...form, clientEmail: e.target.value }); clearFieldError("clientEmail") }}
                    placeholder={phoneDone ? "name@example.com" : "Verify your number first"}
                    className={cn(
                      "w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
                      fieldErrors.clientEmail
                        ? "border-red-400 focus:ring-red-200 focus:border-red-400 bg-red-50"
                        : "border-gray-200 focus:ring-brand/30 focus:border-brand"
                    )}
                  />
                  {fieldErrors.clientEmail ? (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.clientEmail}</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">
                      We&apos;ll send your booking confirmation and ticket to this email
                    </p>
                  )}
                </div>
              )
            })()}

            {(() => {
              // Name + email stay locked until the WhatsApp code is verified
              // (privacy: a phone number alone must not reveal anyone's details).
              const phoneDone = otpVerified
              return (
                <div>
                  <label className={cn(
                    "block text-sm font-medium mb-1",
                    phoneDone ? "text-gray-700" : "text-gray-400"
                  )}>
                    Full Name *
                  </label>
                  <input
                    ref={fieldRefs.clientName}
                    type="text"
                    disabled={!phoneDone}
                    value={form.clientName}
                    onChange={(e) => { setForm({ ...form, clientName: e.target.value }); clearFieldError("clientName") }}
                    placeholder={phoneDone ? "Your full name" : "Verify your number first"}
                    className={cn(
                      "w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
                      fieldErrors.clientName
                        ? "border-red-400 focus:ring-red-200 focus:border-red-400 bg-red-50"
                        : "border-gray-200 focus:ring-brand/30 focus:border-brand"
                    )}
                  />
                  {fieldErrors.clientName && <p className="text-xs text-red-500 mt-1">{fieldErrors.clientName}</p>}
                </div>
              )
            })()}

            {services.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Additional Services <span className="text-gray-400">(optional)</span></label>
                <div className="space-y-2">
                  {services.map((svc) => (
                    <label key={svc.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedServices.includes(svc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedServices([...selectedServices, svc.id])
                            } else {
                              setSelectedServices(selectedServices.filter((id) => id !== svc.id))
                            }
                          }}
                          className="rounded accent-brand"
                        />
                        <span className="text-sm text-gray-700">{svc.name}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-600">{Math.round(svc.price / 1000)}k</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Running total */}
            {(() => {
              const perPerson = selectedSlot.price ?? 300000
              const sessionTotal = perPerson * partySize
              const chosenServices = services.filter((s) => selectedServices.includes(s.id))
              const servicesTotal = chosenServices.reduce((sum, s) => sum + s.price, 0)
              const total = sessionTotal + servicesTotal
              return (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Session{partySize > 1 ? ` × ${partySize}` : ""}</span>
                    <span>{formatIDR(sessionTotal)}</span>
                  </div>
                  {chosenServices.map((s) => (
                    <div key={s.id} className="flex justify-between text-xs text-gray-500">
                      <span>+ {s.name}</span>
                      <span>{formatIDR(s.price)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold text-gray-800 pt-1 border-t border-gray-200">
                    <span>Total</span>
                    <span>{formatIDR(total)}</span>
                  </div>
                </div>
              )
            })()}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !otpVerified}
              title={!otpVerified ? "Verify your WhatsApp code first" : undefined}
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors"
            >
              {submitting ? "Booking…" : "Continue"}
            </button>
            {/* Cancellation policy, stated up-front — matches canCancelBooking:
                ≥2h before class (or within 30 min of booking). Builds trust at
                the exact moment of commitment. */}
            <p className="text-[11px] text-gray-400 text-center leading-relaxed">
              {(studio?.country || "").toUpperCase() === "US" ? "Booking is free; your coach sends the class link after you book. Free cancellation up to 2 hours before" : "Booking is free - you pay at the studio. Free cancellation up to 2 hours before"}
              class{studio?.whatsappEnabled ? " via the Cancel button in your WhatsApp confirmation" : ""}.
            </p>
            </div>)}
          </form>
        </div>
      )}

      {/* Duplicate-booking confirmation. Lets a client knowingly book an extra
          spot (e.g. for a friend) under their own name/phone after confirming. */}
      {dupWarn && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Users size={18} className="text-amber-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Already booked</h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              {dupWarn.existingName
                ? <>This phone number already has a booking for this session{dupWarn.existingName ? <> under <span className="font-semibold text-gray-800">{dupWarn.existingName}</span></> : ""}. </>
                : <>This phone number already has a booking for this session. </>}
              Book another spot anyway (e.g. for a friend)?
            </p>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setDupWarn(null)}
                disabled={submitting}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setDupWarn(null); submitBooking(true) }}
                disabled={submitting}
                className="flex-1 bg-brand text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-brand-dark disabled:opacity-60"
              >
                {submitting ? "Booking…" : "Yes, continue"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
