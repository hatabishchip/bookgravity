"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { format, addMonths, subMonths, startOfMonth, getDaysInMonth, getDay, isBefore, isAfter, startOfDay, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Clock, Users, CheckCircle } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { cn } from "@/lib/utils"

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
  maxCapacity: number
  bookedCount: number
  available: boolean
}

type Service = {
  id: string
  name: string
  price: number
}

type Step = "date" | "time" | "details" | "done"

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
}

export default function BookingWidget({ services }: { services: Service[] }) {
  const [step, setStep] = useState<Step>("date")
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [allSlots, setAllSlots] = useState<Slot[]>([])
  const [partySize, setPartySize] = useState(1)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const fieldRefs = {
    clientName: useRef<HTMLInputElement>(null),
    clientEmail: useRef<HTMLInputElement>(null),
    clientPhone: useRef<HTMLInputElement>(null),
  }
  const [booking, setBooking] = useState<{ id: string; clientName: string; slot: Slot; ticketCode: string } | null>(null)

  const [form, setForm] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
  })

  const today = startOfDay(new Date())
  // Allow booking through the end of next month
  const nextMonthEnd = addMonths(startOfMonth(today), 2)
  const maxDate = new Date(nextMonthEnd.getTime() - 1)

  const fetchAvailableDates = useCallback(async () => {
    const res = await fetch("/api/slots")
    const data: Slot[] = await res.json()
    setAllSlots(data)
  }, [])

  // Dates that have at least one slot with enough free seats for the party
  const availableDates = new Set(
    allSlots
      .filter((s) => (s.maxCapacity - s.bookedCount) >= partySize)
      .map((s) => s.date)
  )

  useEffect(() => { fetchAvailableDates() }, [fetchAvailableDates])

  const fetchSlots = useCallback(async (date: string) => {
    setLoading(true)
    const res = await fetch(`/api/slots?date=${date}`)
    const data: Slot[] = await res.json()
    setSlots(data)
    setLoading(false)
  }, [])

  const handleDateSelect = (date: Date) => {
    const str = format(date, "yyyy-MM-dd")
    setSelectedDate(str)
    fetchSlots(str)
    setStep("time")
    setSelectedSlot(null)
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
    return errors
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
    setSubmitting(true)
    setError("")

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selectedSlot.id,
          ...form,
          serviceIds: selectedServices,
          partySize,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.error || "Booking failed")
        return
      }

      const data = await res.json()
      setBooking({ id: data.id, clientName: form.clientName, slot: selectedSlot, ticketCode: data.ticketCode })
      setStep("done")
    } finally {
      setSubmitting(false)
    }
  }

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) setFieldErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
  }

  // Calendar rendering
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = getDaysInMonth(currentMonth)
  const firstDayOfWeek = getDay(startOfMonth(currentMonth))

  const currentMonthStart = startOfMonth(currentMonth)
  const thisMonthStart = startOfMonth(today)
  const nextMonthStart = startOfMonth(addMonths(today, 1))
  const canGoPrev = isAfter(currentMonthStart, thisMonthStart)
  const canGoNext = isBefore(currentMonthStart, nextMonthStart)

  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))
  const blanks = Array.from({ length: firstDayOfWeek })

  // Compact full-screen ticket on done step
  if (step === "done" && booking) {
    return (
      <div className="fixed inset-0 bg-[#F5F4F0] z-50 flex items-center justify-center p-4 overflow-hidden">
        <div className="bg-white rounded-2xl shadow-xl p-5 sm:p-6 w-full max-w-sm text-center">
          {/* Brand */}
          <div className="mb-4 pb-4 border-b border-gray-100">
            <div className="text-2xl font-bold text-[#2C6E49] tracking-tight leading-tight">Gravity Stretching</div>
            <div className="text-xs text-gray-500 uppercase tracking-[0.3em] mt-1.5 font-medium">Canggu</div>
          </div>

          {/* Confirmation header */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <CheckCircle size={18} className="text-[#2C6E49]" />
            <span className="text-sm font-medium text-gray-700">Spot confirmed for {booking.clientName}</span>
          </div>

          {/* Slot info */}
          <div className="text-xs text-gray-400 mb-4">
            {selectedDate && format(parseISO(selectedDate), "EEE, MMM d")} · {formatTime(booking.slot.startTime)}
          </div>

          {/* QR code */}
          <div className="flex justify-center mb-3">
            <div className="p-2 bg-white rounded-xl border border-gray-100">
              <QRCodeSVG
                value={`GRAVITY-${booking.ticketCode}`}
                size={140}
                fgColor="#1a1a1a"
                bgColor="#ffffff"
                level="M"
              />
            </div>
          </div>

          {/* Code */}
          <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Your code</div>
          <div className="text-4xl font-bold tracking-[0.3em] text-gray-900 mb-3">{booking.ticketCode}</div>

          <p className="text-xs text-gray-400 mb-4">See you on the mat 🌿</p>

          <button
            onClick={() => {
              setStep("date")
              setSelectedDate(null)
              setSelectedSlot(null)
              setForm({ clientName: "", clientEmail: "", clientPhone: "" })
              setSelectedServices([])
              setBooking(null)
              setPartySize(1)
              fetchAvailableDates()
            }}
            className="w-full bg-[#2C6E49] hover:bg-[#1E4D34] text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Book another session
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Steps indicator */}
      {(() => {
        const stepList = ["date", "time", "details"] as Step[]
        const currentIdx = step === "done" ? 3 : stepList.indexOf(step)
        const canNavigateTo = (s: Step) => {
          const targetIdx = stepList.indexOf(s)
          if (targetIdx >= currentIdx) return false
          if (s === "time") return !!selectedDate
          if (s === "details") return !!selectedSlot
          return true
        }
        return (
          <div className="flex items-center justify-center gap-2 mb-8">
            {stepList.map((s, i) => {
              const isCompleted = currentIdx > i
              const isCurrent = currentIdx === i
              const clickable = canNavigateTo(s)
              return (
                <div key={s} className="flex items-center gap-2">
                  <button
                    onClick={() => clickable && setStep(s)}
                    disabled={!clickable}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                      isCompleted || isCurrent ? "bg-[#2C6E49] text-white" : "bg-gray-200 text-gray-500",
                      clickable ? "cursor-pointer hover:opacity-80 hover:scale-105" : "cursor-default"
                    )}
                  >
                    {isCompleted ? <CheckCircle size={16} /> : i + 1}
                  </button>
                  <span className={cn("text-sm hidden sm:block", isCurrent || isCompleted ? "text-gray-700" : "text-gray-400")}>
                    {s === "date" ? "Choose Date" : s === "time" ? "Choose Time" : "Your Details"}
                  </span>
                  {i < 2 && <div className="w-8 h-px bg-gray-300" />}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Step: Date */}
      {step === "date" && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          {/* Price banner */}
          <div className="bg-[#2C6E49]/8 border border-[#2C6E49]/15 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-[#2C6E49]/70 font-medium">Group class</div>
              <div className="text-sm text-gray-700 mt-0.5">Up to 6 people · 1.5 hours</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-2xl font-bold text-[#2C6E49] leading-none">300k</div>
              <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wide">IDR / person</div>
            </div>
          </div>

          {/* Party size */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-5 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-gray-800">How many people?</div>
              <div className="text-xs text-gray-400 mt-0.5">Including yourself · max 6 per class</div>
            </div>
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setPartySize(Math.max(1, partySize - 1))}
                disabled={partySize <= 1}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Decrease"
              >
                −
              </button>
              <span className="w-6 text-center font-bold text-base text-gray-900 tabular-nums">{partySize}</span>
              <button
                type="button"
                onClick={() => setPartySize(Math.min(6, partySize + 1))}
                disabled={partySize >= 6}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Increase"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => canGoPrev && setCurrentMonth(subMonths(currentMonth, 1))}
              className={cn("p-2 rounded-full hover:bg-gray-100 transition-colors", !canGoPrev && "opacity-30 cursor-not-allowed")}
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className="text-lg font-semibold text-gray-800">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <button
              onClick={() => canGoNext && setCurrentMonth(addMonths(currentMonth, 1))}
              className={cn("p-2 rounded-full hover:bg-gray-100 transition-colors", !canGoNext && "opacity-30 cursor-not-allowed")}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {blanks.map((_, i) => <div key={`b${i}`} />)}
            {days.map((day) => {
              const str = format(day, "yyyy-MM-dd")
              const isPast = isBefore(day, today)
              const isTooFar = isAfter(day, maxDate)
              const hasSlot = availableDates.has(str)
              const disabled = isPast || isTooFar || !hasSlot
              const isSelected = selectedDate === str

              return (
                <button
                  key={str}
                  onClick={() => !disabled && handleDateSelect(day)}
                  disabled={disabled}
                  className={cn(
                    "aspect-square rounded-full text-sm font-medium transition-all flex items-center justify-center relative",
                    isSelected ? "bg-[#2C6E49] text-white" :
                    hasSlot && !isPast && !isTooFar
                      ? "text-gray-800 hover:bg-[#2C6E49]/10 cursor-pointer"
                      : "text-gray-300 cursor-not-allowed",
                  )}
                >
                  {day.getDate()}
                  {hasSlot && !isPast && !isTooFar && !isSelected && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#2C6E49]" />
                  )}
                </button>
              )
            })}
          </div>

          <p className="text-center text-sm text-gray-400 mt-4">
            Dots indicate available dates · Booking opens up to 1 month ahead
          </p>
        </div>
      )}

      {/* Step: Time */}
      {step === "time" && selectedDate && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
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
          ) : (
            <div className="space-y-3">
              {slots.map((slot) => {
                const spotsLeft = slot.maxCapacity - slot.bookedCount
                const enoughForParty = spotsLeft >= partySize
                const canBook = slot.available && enoughForParty
                return (
                  <button
                    key={slot.id}
                    onClick={() => canBook && handleSlotSelect(slot)}
                    disabled={!canBook}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left",
                      canBook
                        ? "border-gray-100 hover:border-[#2C6E49] hover:bg-[#2C6E49]/5 cursor-pointer"
                        : "border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", canBook ? "bg-[#2C6E49]/10" : "bg-gray-100")}>
                        <Clock size={18} className={canBook ? "text-[#2C6E49]" : "text-gray-400"} />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">
                          {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
                        </div>
                        <div className="text-sm text-gray-400">Group class · 6 max</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("flex items-center gap-1 text-sm font-medium", canBook ? "text-[#2C6E49]" : "text-gray-400")}>
                        <Users size={14} />
                        {spotsLeft} / {slot.maxCapacity} spots
                      </div>
                      <div className={cn("text-xs mt-0.5", canBook ? "text-[#2C6E49]/70" : "text-gray-400")}>
                        {!slot.available ? "Full" : !enoughForParty ? `Only ${spotsLeft} left` : "Available"}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
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
              {formatTime(selectedSlot.startTime)} – {formatTime(selectedSlot.endTime)} · Group class
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
              <input
                ref={fieldRefs.clientName}
                type="text"
                value={form.clientName}
                onChange={(e) => { setForm({ ...form, clientName: e.target.value }); clearFieldError("clientName") }}
                placeholder="Your full name"
                className={cn(
                  "w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-colors",
                  fieldErrors.clientName
                    ? "border-red-400 focus:ring-red-200 focus:border-red-400 bg-red-50"
                    : "border-gray-200 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                )}
              />
              {fieldErrors.clientName && <p className="text-xs text-red-500 mt-1">{fieldErrors.clientName}</p>}
            </div>
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
                      "w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-colors",
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

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#2C6E49] hover:bg-[#1E4D34] disabled:opacity-60 text-white font-semibold py-4 rounded-xl transition-colors"
            >
              {submitting ? "Booking..." : "Confirm Booking"}
            </button>
          </form>
        </div>
      )}

    </div>
  )
}
