"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { format, startOfMonth, getDaysInMonth, getDay, isBefore, startOfDay, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Clock, Users, CheckCircle, MessageCircle } from "lucide-react"
import { whatsappLink, bookingConfirmationMessage } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"

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

type PhoneCountry = { code: string; flag: string; name: string; min: number; max: number }

const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "+380", flag: "🇺🇦", name: "Ukraine",             min: 9,  max: 9  },
  { code: "+375", flag: "🇧🇾", name: "Belarus",             min: 9,  max: 9  },
  { code: "+372", flag: "🇪🇪", name: "Estonia",             min: 7,  max: 8  },
  { code: "+371", flag: "🇱🇻", name: "Latvia",              min: 8,  max: 8  },
  { code: "+370", flag: "🇱🇹", name: "Lithuania",           min: 8,  max: 8  },
  { code: "+971", flag: "🇦🇪", name: "UAE",                 min: 9,  max: 9  },
  { code: "+856", flag: "🇱🇦", name: "Laos",                min: 8,  max: 9  },
  { code: "+855", flag: "🇰🇭", name: "Cambodia",            min: 8,  max: 9  },
  { code: "+852", flag: "🇭🇰", name: "Hong Kong",           min: 8,  max: 8  },
  { code: "+66",  flag: "🇹🇭", name: "Thailand",            min: 8,  max: 9  },
  { code: "+65",  flag: "🇸🇬", name: "Singapore",           min: 8,  max: 8  },
  { code: "+63",  flag: "🇵🇭", name: "Philippines",         min: 10, max: 10 },
  { code: "+62",  flag: "🇮🇩", name: "Indonesia",           min: 8,  max: 12 },
  { code: "+61",  flag: "🇦🇺", name: "Australia",           min: 9,  max: 9  },
  { code: "+60",  flag: "🇲🇾", name: "Malaysia",            min: 9,  max: 10 },
  { code: "+55",  flag: "🇧🇷", name: "Brazil",              min: 10, max: 11 },
  { code: "+49",  flag: "🇩🇪", name: "Germany",             min: 10, max: 11 },
  { code: "+48",  flag: "🇵🇱", name: "Poland",              min: 9,  max: 9  },
  { code: "+47",  flag: "🇳🇴", name: "Norway",              min: 8,  max: 8  },
  { code: "+46",  flag: "🇸🇪", name: "Sweden",              min: 9,  max: 9  },
  { code: "+45",  flag: "🇩🇰", name: "Denmark",             min: 8,  max: 8  },
  { code: "+44",  flag: "🇬🇧", name: "UK",                  min: 10, max: 10 },
  { code: "+43",  flag: "🇦🇹", name: "Austria",             min: 10, max: 11 },
  { code: "+41",  flag: "🇨🇭", name: "Switzerland",         min: 9,  max: 9  },
  { code: "+40",  flag: "🇷🇴", name: "Romania",             min: 9,  max: 9  },
  { code: "+39",  flag: "🇮🇹", name: "Italy",               min: 9,  max: 11 },
  { code: "+36",  flag: "🇭🇺", name: "Hungary",             min: 9,  max: 9  },
  { code: "+34",  flag: "🇪🇸", name: "Spain",               min: 9,  max: 9  },
  { code: "+33",  flag: "🇫🇷", name: "France",              min: 9,  max: 9  },
  { code: "+32",  flag: "🇧🇪", name: "Belgium",             min: 9,  max: 9  },
  { code: "+31",  flag: "🇳🇱", name: "Netherlands",         min: 9,  max: 9  },
  { code: "+30",  flag: "🇬🇷", name: "Greece",              min: 10, max: 10 },
  { code: "+27",  flag: "🇿🇦", name: "South Africa",        min: 9,  max: 9  },
  { code: "+91",  flag: "🇮🇳", name: "India",               min: 10, max: 10 },
  { code: "+90",  flag: "🇹🇷", name: "Turkey",              min: 10, max: 10 },
  { code: "+86",  flag: "🇨🇳", name: "China",               min: 11, max: 11 },
  { code: "+84",  flag: "🇻🇳", name: "Vietnam",             min: 9,  max: 10 },
  { code: "+82",  flag: "🇰🇷", name: "South Korea",         min: 9,  max: 10 },
  { code: "+81",  flag: "🇯🇵", name: "Japan",               min: 9,  max: 10 },
  { code: "+7",   flag: "🇷🇺", name: "Russia / Kazakhstan", min: 10, max: 10 },
  { code: "+1",   flag: "🇺🇸", name: "USA / Canada",        min: 10, max: 10 },
].sort((a, b) => b.code.length - a.code.length)

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

function detectCountry(phone: string): PhoneCountry | null {
  return PHONE_COUNTRIES.find((c) => phone.startsWith(c.code)) ?? null
}

function subscriberDigits(phone: string, country: PhoneCountry): number {
  const codeLen = country.code.length - 1
  return phone.replace(/\D/g, "").slice(codeLen).length
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

// Format IDR amounts: 300000 -> "300k", 1000000 -> "1M", 1800000 -> "1.8M"
function formatIDR(amount: number) {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000
    const str = m % 1 === 0 ? m.toString() : m.toFixed(1).replace(/\.0$/, "")
    return `${str}M IDR`
  }
  return `${Math.round(amount / 1000)}k IDR`
}

// Client-facing end time: 90 minutes after start (real slot is 120 with buffer)
function clientEndTime(startTime: string) {
  const [h, m] = startTime.split(":").map(Number)
  const total = h * 60 + m + 90
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  const ampm = eh >= 12 ? "PM" : "AM"
  return `${eh % 12 || 12}:${String(em).padStart(2, "0")} ${ampm}`
}

export default function BookingWidget({ services, studio, studioSlug }: {
  services: Service[]
  studio?: { name: string; slug: string; logoUrl: string | null; locationUrl?: string | null }
  // Slug of the studio this widget books into. Sent as ?studio= on the
  // slots/bookings calls so the API scopes to the right studio regardless of
  // host (we serve every studio from bookgravity.com now). Falls back to the
  // studio prop's slug.
  studioSlug?: string
}) {
  // Query-string suffix that pins API calls to this studio.
  const studioParam = (studioSlug ?? studio?.slug) ? `studio=${encodeURIComponent(studioSlug ?? studio!.slug)}` : ""
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
  // WhatsApp confirmation code (anti-spam): the 2-digit code the client types
  // on the "verify" step, plus send/verify status.
  const [otpCode, setOtpCode] = useState("")
  const [otpSending, setOtpSending] = useState(false)
  const [otpError, setOtpError] = useState("")
  // Brief "Booking confirmed ✓" flash shown on the verify step right before we
  // auto-advance to the ticket.
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const fieldRefs = {
    clientName: useRef<HTMLInputElement>(null),
    clientPhone: useRef<HTMLInputElement>(null),
    clientEmail: useRef<HTMLInputElement>(null),
  }
  const [booking, setBooking] = useState<{ id: string; clientName: string; slot: Slot; ticketCode: string } | null>(null)
  const ticketRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)

  // Send the ticket to the client's OWN WhatsApp number.
  // We intentionally do NOT use the Web Share API (it opens the system share
  // sheet / contact picker, letting you send to anyone). Instead we save the
  // ticket image to the device and open a wa.me chat pre-targeted to the
  // number used for the booking, with the confirmation text prefilled.
  async function shareTicketToWhatsApp(messageText: string, waLink: string | null) {
    if (!ticketRef.current || sharing) return
    setSharing(true)
    try {
      const { toBlob } = await import("html-to-image")
      const blob = await toBlob(ticketRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      })
      // Save the ticket PNG to the device so the client keeps it (wa.me links
      // can't carry an image attachment). Best-effort — never blocks the link.
      if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `gravity-ticket-${booking?.ticketCode || "ticket"}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch (e) {
      console.error("Render ticket image failed:", e)
    } finally {
      // Always open the client's own WhatsApp chat with the text prefilled.
      if (waLink) window.open(waLink, "_blank")
      setSharing(false)
    }
  }

  const [form, setForm] = useState({
    clientName: "",
    clientPhone: "",
    clientEmail: "",
  })
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "new">("idle")
  // Informational membership balance for this phone at this studio (0 = none).
  // Clients can't spend a class — this is shown for awareness only; a trainer
  // deducts it at the studio.
  const [membershipLeft, setMembershipLeft] = useState(0)
  // Track which phone we last fetched a lookup for to avoid re-fetching on every keystroke
  const lastLookedUpPhoneRef = useRef("")

  // When phone reaches minimum length for the detected country, look up the
  // existing client and auto-fill name + email (only fields the user hasn't
  // already typed into).
  useEffect(() => {
    const country = detectCountry(form.clientPhone)
    const phoneReady = !!country && subscriberDigits(form.clientPhone, country) >= country.min
    if (!phoneReady) {
      setLookupState("idle")
      lastLookedUpPhoneRef.current = ""
      return
    }
    if (lastLookedUpPhoneRef.current === form.clientPhone) return
    lastLookedUpPhoneRef.current = form.clientPhone
    setLookupState("loading")
    const ctrl = new AbortController()
    fetch(
      `/api/lookup-client?phone=${encodeURIComponent(form.clientPhone)}${studioParam ? `&${studioParam}` : ""}`,
      { signal: ctrl.signal }
    )
      .then((r) => r.ok ? r.json() : { name: null, email: null, membershipRemaining: 0 })
      .then((d: { name: string | null; email: string | null; membershipRemaining?: number }) => {
        setMembershipLeft(d.membershipRemaining ?? 0)
        if (d.name || d.email) {
          setLookupState("found")
          setForm((prev) => ({
            ...prev,
            clientName: prev.clientName.trim() ? prev.clientName : (d.name ?? prev.clientName),
            clientEmail: prev.clientEmail.trim() ? prev.clientEmail : (d.email ?? prev.clientEmail),
          }))
        } else {
          setLookupState("new")
        }
      })
      .catch(() => { setLookupState("idle") })
    return () => ctrl.abort()
  }, [form.clientPhone, studioParam])

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
  const pastDatesWithSlots = new Set(
    allSlots
      .filter((s) => s.date < todayStr)
      .map((s) => s.date)
  )
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
        // Bad/expired confirmation code → keep the verify step, show the hint.
        if (err.otpError) {
          setStep("verify")
          setOtpError(
            err.otpError === "expired"
              ? "That code expired. Tap “Resend code” to get a new one."
              : err.otpError === "locked"
                ? "Too many tries. Tap “Resend code” to get a new one."
                : typeof err.otpRemaining === "number"
                  ? `Wrong code — ${err.otpRemaining} tries left.`
                  : "Enter the code we sent to your WhatsApp.",
          )
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
      // From the verify step: flash "confirmed" for a beat, then auto-advance
      // to the ticket. Otherwise go straight to the ticket.
      if (step === "verify") {
        setConfirmed(true)
        setTimeout(() => { setConfirmed(false); setStep("done") }, 1100)
      } else {
        setStep("done")
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Request a WhatsApp confirmation code, then move to the verify step. If the
  // studio has no WhatsApp (skipped), book straight away as before.
  const requestOtp = async () => {
    if (!selectedSlot) return
    setOtpSending(true)
    setError("")
    setOtpError("")
    try {
      const res = await fetch(`/api/otp/send${studioParam ? `?${studioParam}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.clientPhone, name: form.clientName }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.skipped) {
        // No WhatsApp for this studio → original no-OTP flow.
        submitBooking(false)
        return
      }
      if (res.ok && data.sent) {
        setOtpCode("")
        setStep("verify")
        return
      }
      if (res.status === 429) {
        // A code was just sent — go enter it.
        setStep("verify")
        setOtpError("A code was just sent. Check WhatsApp and enter it below.")
        return
      }
      setError(data.error || "Couldn't send the confirmation code. Check your number.")
    } catch {
      setError("Network error — please try again.")
    } finally {
      setOtpSending(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSlot) return

    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const firstKey = Object.keys(errors)[0] as keyof typeof fieldRefs
      fieldRefs[firstKey]?.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      fieldRefs[firstKey]?.current?.focus()
      return
    }

    setFieldErrors({})
    // Send the WhatsApp code and advance to the verify step (book happens there).
    requestOtp()
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
            const hadPastClass = pastDatesWithSlots.has(str)
            // Has a class today/soon that can't be booked online (cutoff / in
            // progress) — still selectable so the visitor can see it greyed.
            const hasInfo = infoDates.has(str)
            const clickable = (hasSlot || hasInfo) && !isPast

            // No persistent "selected day" highlight: tapping a date advances
            // straight to the time step, and going back shouldn't leave it
            // filled. Days just show their availability dot.
            const dotColor = hasSlot
              ? "bg-[#2C6E49]"
              : hasInfo
                ? "bg-amber-400"
                : isFull && !isPast
                  ? "bg-rose-500"
                  : isPast && hadPastClass
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
                    ? "text-gray-900 hover:bg-[#2C6E49]/10 cursor-pointer"
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

    return (
      <div className="fixed inset-0 bg-gradient-to-br from-[#F5F4F0] via-[#EFEEE8] to-[#E8E6DD] z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-sm my-auto">
          {/* Ticket card */}
          <div ref={ticketRef} className="bg-white rounded-3xl shadow-2xl relative overflow-hidden">
            {/* Top accent bar */}
            <div className="h-1.5 bg-gradient-to-r from-[#2C6E49] via-[#3a8a5d] to-[#2C6E49]"></div>

            {/* Header with logo */}
            <div className="px-6 pt-6 pb-5 text-center">
              <div className="flex justify-center mb-3">
                <div className="w-20 h-20 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center shadow-sm overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={studio?.logoUrl || "/api/app-icon"} alt={studio?.name || "Gravity Stretching"} className="w-16 h-16 object-contain" />
                </div>
              </div>

              {/* Confirmed badge */}
              <div className="inline-flex items-center gap-1.5 bg-[#2C6E49]/10 text-[#2C6E49] px-3 py-1 rounded-full mb-3">
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

            {/* Perforated divider */}
            <div className="relative">
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#F5F4F0] rounded-full"></div>
              <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#F5F4F0] rounded-full"></div>
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
              <div className="text-base font-bold text-[#2C6E49] tracking-tight">{studio?.name || "Gravity Stretching"}</div>
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
            {waLink && (
              <button
                onClick={() => shareTicketToWhatsApp(messageText, waLink)}
                disabled={sharing}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1da851] disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                <MessageCircle size={16} />
                {sharing ? "Preparing ticket..." : "Send to WhatsApp"}
              </button>
            )}

            <button
              onClick={() => {
                try { localStorage.removeItem("bg_active_ticket") } catch {}
                setStep("date")
                setSelectedDate(null)
                setSelectedSlot(null)
                setForm({ clientName: "", clientPhone: "", clientEmail: "" })
                setSelectedServices([])
                setBooking(null)
                setPartySize(1)
                setOtpCode("")
                setOtpError("")
                fetchAvailableDates()
              }}
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
                    isCurrent ? "w-6 bg-[#2C6E49]" : isCompleted ? "w-1.5 bg-[#2C6E49]" : "w-1.5 bg-gray-300",
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
          <div className="bg-[#2C6E49]/[0.07] border border-[#2C6E49]/15 rounded-2xl mb-4 overflow-hidden">
            {/* Header: class label + details (left), price (right) */}
            <div className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#2C6E49] leading-none">Group class</div>
                <div className="text-[11px] text-gray-500 mt-1.5 leading-none">Up to 6 people · 1.5 hours</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-2xl font-bold text-[#2C6E49] leading-none tabular-nums">300k</div>
                <div className="text-[10px] text-gray-500 mt-1.5 uppercase tracking-wide leading-none">IDR / person</div>
              </div>
            </div>

            {/* Stepper row on its own line, divided from the header */}
            <div className="px-4 py-2.5 border-t border-[#2C6E49]/12 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-600">How many people?</span>
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setPartySize(Math.max(1, partySize - 1))}
                  disabled={partySize <= 1}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl text-[#2C6E49] hover:bg-[#2C6E49]/10 active:bg-[#2C6E49]/15 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                  aria-label="Decrease people"
                >
                  −
                </button>
                <span className="w-8 text-center font-bold text-lg text-gray-900 tabular-nums leading-none">{partySize}</span>
                <button
                  type="button"
                  onClick={() => setPartySize(Math.min(6, partySize + 1))}
                  disabled={partySize >= 6}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl text-[#2C6E49] hover:bg-[#2C6E49]/10 active:bg-[#2C6E49]/15 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
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
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2C6E49]" />
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
                            ? "border-gray-100 hover:border-[#2C6E49] hover:bg-[#2C6E49]/5 cursor-pointer"
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
                            canBook ? "bg-[#2C6E49]/10" : withinCutoff ? "bg-gray-200" : isFull ? "bg-gray-200" : "bg-amber-100"
                          )}>
                            <Clock size={18} className={canBook ? "text-[#2C6E49]" : withinCutoff ? "text-gray-400" : isFull ? "text-gray-400" : "text-amber-600"} />
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
                                      : "bg-[#2C6E49]/10 text-[#2C6E49]"
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
                              "inline-block text-center leading-5 px-2.5 h-5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                              slot.started ? "bg-[#2C6E49] text-white" : "bg-gray-300 text-gray-600",
                            )}>{slot.started ? "Live" : "Closed"}</span>
                          ) : isFull ? (
                            <span className="inline-block text-center leading-5 px-2.5 h-5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-rose-500 text-white">Sold out</span>
                          ) : !enoughForParty ? (
                            <span className="inline-block text-center leading-5 px-2.5 h-5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-500 text-white">{`Only ${spotsLeft} left`}</span>
                          ) : (
                            <div className="flex items-center gap-1 text-sm font-medium text-[#2C6E49]">
                              <Users size={14} />
                              {spotsLeft} / {slot.maxCapacity} spots
                            </div>
                          )}
                          <div className={cn(
                            "text-[11px] mt-0.5",
                            canBook ? "text-[#2C6E49]/70" : withinCutoff ? "text-gray-400" : isFull ? "text-rose-500 font-semibold" : "text-amber-600/70"
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

          <div className="bg-[#2C6E49]/5 rounded-xl p-4 mb-6">
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
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input
                    ref={fieldRefs.clientPhone}
                    type="tel"
                    autoFocus
                    value={form.clientPhone}
                    onChange={(e) => {
                      const stripped = "+" + e.target.value.replace(/\D/g, "")
                      const c = detectCountry(stripped)
                      // Block if unknown code and already past max prefix length
                      if (!c && stripped.replace(/\D/g, "").length > 3) return
                      // Block if known code but subscriber digits exceeded max
                      if (c && subscriberDigits(stripped, c) > c.max) return
                      const formatted = c ? formatPhoneInput(stripped) : stripped
                      setForm({ ...form, clientPhone: formatted })
                      clearFieldError("clientPhone")
                    }}
                    placeholder="+62 812 3456 7890"
                    className={cn(
                      "w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 transition-colors",
                      hasError
                        ? "border-red-400 focus:ring-red-200 focus:border-red-400 bg-red-50"
                        : "border-gray-200 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                    )}
                  />
                  {fieldErrors.clientPhone ? (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors.clientPhone}</p>
                  ) : unknownCode ? (
                    <p className="text-xs text-red-500 mt-1">Unknown country code — please start with a valid code, e.g. +62</p>
                  ) : country ? (
                    (() => {
                      const sub = subscriberDigits(form.clientPhone, country)
                      const done = sub >= country.min
                      return (
                        <p className={cn("text-xs mt-1", done ? "text-[#2C6E49]" : "text-amber-500")}>
                          {country.flag} {country.name}
                          {!done && ` · ${sub} / ${country.min} digits`}
                          {done && " ✓"}
                        </p>
                      )
                    })()
                  ) : (
                    <p className="text-xs text-gray-400 mt-1">Start with country code, e.g. +62 for Indonesia</p>
                  )}
                </div>
              )
            })()}

            {/* Informational membership balance — clients can't spend a class
                here; a trainer deducts it at the studio. Shown once the lookup
                finds an active pass for this phone at this studio. */}
            {membershipLeft > 0 && (
              <div className="rounded-xl border border-[#2C6E49]/30 bg-[#2C6E49]/5 px-4 py-3 text-sm text-[#2C6E49]">
                🎟️ You have <span className="font-semibold">{membershipLeft}</span>{" "}
                {membershipLeft === 1 ? "class" : "classes"} left on your membership.{" "}
                <span className="text-[#2C6E49]/70">Your trainer will check you in at the studio.</span>
              </div>
            )}

            {(() => {
              const country = detectCountry(form.clientPhone)
              const phoneDone = !!country && subscriberDigits(form.clientPhone, country) >= country.min
              return (
                <div>
                  <label className={cn(
                    "block text-sm font-medium mb-1",
                    phoneDone ? "text-gray-700" : "text-gray-400"
                  )}>
                    Email *
                    {lookupState === "loading" && <span className="text-xs text-gray-400 ml-2">looking up…</span>}
                    {lookupState === "found" && form.clientEmail && <span className="text-xs text-[#2C6E49] ml-2">welcome back ✓</span>}
                  </label>
                  <input
                    ref={fieldRefs.clientEmail}
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    disabled={!phoneDone}
                    value={form.clientEmail}
                    onChange={(e) => { setForm({ ...form, clientEmail: e.target.value }); clearFieldError("clientEmail") }}
                    placeholder={phoneDone ? "name@example.com" : "Enter phone number first"}
                    className={cn(
                      "w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
                      fieldErrors.clientEmail
                        ? "border-red-400 focus:ring-red-200 focus:border-red-400 bg-red-50"
                        : "border-gray-200 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
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
              const country = detectCountry(form.clientPhone)
              const phoneDone = !!country && subscriberDigits(form.clientPhone, country) >= country.min
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
                    placeholder={phoneDone ? "Your full name" : "Enter phone number first"}
                    className={cn(
                      "w-full border rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
                      fieldErrors.clientName
                        ? "border-red-400 focus:ring-red-200 focus:border-red-400 bg-red-50"
                        : "border-gray-200 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
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
                          className="rounded accent-[#2C6E49]"
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
              disabled={submitting || otpSending}
              className="w-full bg-[#2C6E49] hover:bg-[#1E4D34] disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors"
            >
              {otpSending ? "Sending code…" : "Continue"}
            </button>
            <p className="text-[11px] text-gray-400 text-center -mt-1">
              We&apos;ll send a confirmation code to your WhatsApp.
            </p>
          </form>
        </div>
      )}

      {/* Step 4 — WhatsApp code confirmation (anti-spam). Auto-verifies the
          moment 2 digits are entered: no Confirm button. Wrong → red field;
          right → a brief "Booking confirmed" flash, then auto-advance. */}
      {step === "verify" && selectedSlot && (
        <div>
          {!confirmed && (
            <button
              onClick={() => { setStep("details"); setOtpError(""); setOtpCode("") }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
            >
              ← Back
            </button>
          )}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            {confirmed ? (
              <div className="py-6 animate-in fade-in zoom-in duration-300">
                <div className="text-5xl mb-3">✅</div>
                <h3 className="text-xl font-bold text-[#2C6E49]">Booking confirmed</h3>
                <p className="text-sm text-gray-500 mt-1">Code {otpCode} accepted — opening your ticket…</p>
              </div>
            ) : (
              <>
                <div className="text-3xl mb-2">📲</div>
                <h3 className="text-lg font-bold text-gray-900">Confirm your booking</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Enter the 2-digit code from your WhatsApp
                  <br />
                  <span className="font-medium text-gray-700">{form.clientPhone}</span>
                </p>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={2}
                  value={otpCode}
                  disabled={submitting}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 2)
                    setOtpCode(v)
                    setOtpError("")
                    // Auto-verify as soon as both digits are in — no button.
                    if (v.length === 2 && !submitting) submitBooking(false, v)
                  }}
                  placeholder="—"
                  aria-label="Confirmation code"
                  className={cn(
                    "mt-5 w-32 mx-auto block text-center text-3xl font-bold tracking-[0.4em] border-2 rounded-xl py-3 focus:outline-none focus:ring-2 disabled:opacity-60",
                    otpError
                      ? "border-red-500 text-red-600 focus:border-red-500 focus:ring-red-500/20"
                      : "border-gray-200 focus:border-[#2C6E49] focus:ring-[#2C6E49]/20",
                  )}
                />

                {submitting ? (
                  <div className="mt-3 text-sm text-gray-400">Checking…</div>
                ) : otpError ? (
                  <div className="mt-3 text-sm text-red-600">{otpError}</div>
                ) : error ? (
                  <div className="mt-3 text-sm text-red-600">{error}</div>
                ) : (
                  <div className="mt-3 text-xs text-gray-400">The code pops up in your WhatsApp notification.</div>
                )}

                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={otpSending || submitting}
                  className="mt-4 text-sm text-[#2C6E49] font-medium hover:underline disabled:opacity-50"
                >
                  {otpSending ? "Sending…" : "Resend code"}
                </button>
              </>
            )}
          </div>
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
                className="flex-1 bg-[#2C6E49] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#1E4D34] disabled:opacity-60"
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
