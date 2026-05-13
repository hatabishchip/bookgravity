"use client"

import { useState, useEffect, useCallback } from "react"
import { format, addDays, startOfWeek, addWeeks, subWeeks } from "date-fns"
import { ChevronLeft, ChevronRight, Users, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

type Slot = {
  id: string
  date: string
  startTime: string
  endTime: string
  maxCapacity: number
  _count: { bookings: number }
}

type Service = { id: string; name: string; price: number }

type Booking = {
  id: string
  clientName: string
  clientPhone: string
  clientTelegram?: string
  paymentType: string
  paymentStatus: string
  checkedIn: boolean
  notes?: string
  services: { service: Service }[]
  slot: { id: string }
}

type Salary = {
  baseSalary: number
  commissionRate: number
  totalPaid: number
  commission: number
  total: number
  paidBookingsCount: number
  month: string
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "EDC", label: "EDC" },
  { value: "QR", label: "QR" },
  { value: "TRANSFER", label: "Transfer" },
]

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
}

function formatIDR(amount: number) {
  return new Intl.NumberFormat("id-ID").format(amount)
}

export default function TrainerSchedulePage() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [slots, setSlots] = useState<Slot[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [salary, setSalary] = useState<Salary | null>(null)
  const [verifyCodes, setVerifyCodes] = useState<Record<string, string>>({})
  const [verifyStates, setVerifyStates] = useState<Record<string, "ok" | "error" | "idle">>({})

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const from = format(weekStart, "yyyy-MM-dd")
  const to = format(addDays(weekStart, 6), "yyyy-MM-dd")

  const fetchSlots = useCallback(async () => {
    const res = await fetch(`/api/trainer/schedule?from=${from}&to=${to}`)
    setSlots(await res.json())
  }, [from, to])

  const fetchSalary = useCallback(async () => {
    const res = await fetch("/api/trainer/salary")
    if (res.ok) setSalary(await res.json())
  }, [])

  const fetchServices = useCallback(async () => {
    const res = await fetch("/api/admin/services")
    if (res.ok) setServices(await res.json())
  }, [])

  useEffect(() => { fetchSlots() }, [fetchSlots])
  useEffect(() => {
    Promise.all([fetchSalary(), fetchServices()])
  }, [fetchSalary, fetchServices])

  const fetchBookingsForSlot = useCallback(async (slotId: string) => {
    const res = await fetch(`/api/trainer/bookings?slotId=${slotId}`)
    setBookings(await res.json())
  }, [])

  const handleSlotClick = (slot: Slot) => {
    setSelectedSlot(slot)
    fetchBookingsForSlot(slot.id)
    setVerifyCodes({})
    setVerifyStates({})
  }

  const handleVerify = async (bookingId: string, code: string) => {
    if (code.length !== 3) return
    const res = await fetch("/api/trainer/bookings/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, code }),
    })
    if (res.ok) {
      setVerifyStates((prev) => ({ ...prev, [bookingId]: "ok" }))
      fetchBookingsForSlot(selectedSlot!.id)
    } else {
      setVerifyStates((prev) => ({ ...prev, [bookingId]: "error" }))
    }
  }

  const updateBooking = async (id: string, data: Record<string, string>) => {
    setUpdating(id)
    await fetch(`/api/trainer/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (selectedSlot) fetchBookingsForSlot(selectedSlot.id)
    fetchSalary()
    setUpdating(null)
  }

  const handlePaymentMethod = async (booking: Booking, method: string) => {
    const isActive = booking.paymentType === method
    if (isActive) {
      await updateBooking(booking.id, { paymentType: "PENDING", paymentStatus: "UNPAID" })
    } else {
      await updateBooking(booking.id, { paymentType: method, paymentStatus: "PAID" })
    }
  }

  const toggleService = async (booking: Booking, serviceId: string) => {
    const has = booking.services.some((s) => s.service.id === serviceId)
    setUpdating(booking.id)
    if (has) {
      await fetch(`/api/trainer/bookings/${booking.id}/services?serviceId=${serviceId}`, { method: "DELETE" })
    } else {
      await fetch(`/api/trainer/bookings/${booking.id}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId }),
      })
    }
    if (selectedSlot) fetchBookingsForSlot(selectedSlot.id)
    setUpdating(null)
  }

  const slotsForDay = (date: string) => slots.filter((s) => s.date === date)

  return (
    <div>
      {/* Salary card */}
      {salary && (
        <div className="bg-[#2C6E49] text-white rounded-2xl p-4 lg:p-5 mb-6 flex items-center gap-3 lg:gap-6">
          <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <TrendingUp size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs lg:text-sm text-white/70 mb-0.5 lg:mb-1 truncate">My earnings · {salary.month}</div>
            <div className="text-lg lg:text-2xl font-bold tracking-tight">
              Rp {formatIDR(salary.total)}
            </div>
          </div>
          <div className="hidden sm:flex gap-6 text-sm">
            <div>
              <div className="text-white/60 text-xs mb-0.5">Base salary</div>
              <div className="font-medium">Rp {formatIDR(salary.baseSalary)}</div>
            </div>
            <div>
              <div className="text-white/60 text-xs mb-0.5">Commission ({salary.commissionRate}%)</div>
              <div className="font-medium">+ Rp {formatIDR(salary.commission)}</div>
            </div>
            <div>
              <div className="text-white/60 text-xs mb-0.5">Paid sessions</div>
              <div className="font-medium">{salary.paidBookingsCount}</div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 space-y-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">My Schedule</h1>
          <p className="text-gray-500 text-xs lg:text-sm mt-1">
            {format(weekStart, "MMMM d")} – {format(addDays(weekStart, 6), "MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-stretch gap-2">
          <button
            onClick={() => setWeekStart(subWeeks(weekStart, 1))}
            aria-label="Previous week"
            className="flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">Previous</span>
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="flex-1 lg:flex-initial px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            aria-label="Next week"
            className="flex-1 lg:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Week grid */}
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
            {weekDays.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd")
              const isToday = dateStr === format(new Date(), "yyyy-MM-dd")
              const daySlots = slotsForDay(dateStr)

              return (
                <div key={dateStr} className={cn("bg-white rounded-2xl p-3 shadow-sm min-h-[180px]", isToday && "ring-2 ring-[#2C6E49]")}>
                  <div className="text-center mb-3">
                    <div className="text-xs text-gray-400 uppercase tracking-wide">{format(day, "EEE")}</div>
                    <div className={cn("text-lg font-bold mt-0.5", isToday ? "text-[#2C6E49]" : "text-gray-800")}>
                      {format(day, "d")}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {daySlots.map((slot) => (
                      <button
                        key={slot.id}
                        onClick={() => handleSlotClick(slot)}
                        className={cn(
                          "w-full text-left rounded-lg p-2 transition-all border-2",
                          selectedSlot?.id === slot.id
                            ? "bg-[#2C6E49] border-[#2C6E49] text-white"
                            : "bg-[#2C6E49]/5 border-[#2C6E49]/20 hover:border-[#2C6E49]/50"
                        )}
                      >
                        <div className={cn("text-xs font-semibold", selectedSlot?.id === slot.id ? "text-white" : "text-[#2C6E49]")}>
                          {formatTime(slot.startTime)}
                        </div>
                        <div className={cn("text-xs mt-0.5 flex items-center gap-1", selectedSlot?.id === slot.id ? "text-white/80" : "text-gray-500")}>
                          <Users size={10} />
                          {slot._count.bookings}/{slot.maxCapacity}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Booking list for selected slot */}
        {selectedSlot && (
          <div className="w-full lg:w-80 bg-white rounded-2xl shadow-sm p-5 lg:flex-shrink-0 h-fit">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-semibold text-gray-800">
                  {format(new Date(selectedSlot.date + "T00:00:00"), "MMM d")} · {formatTime(selectedSlot.startTime)}
                </div>
                <div className="text-sm text-gray-400 mt-0.5">
                  {selectedSlot._count.bookings}/{selectedSlot.maxCapacity} booked
                </div>
              </div>
              <button onClick={() => setSelectedSlot(null)} className="text-lg text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100">×</button>
            </div>

            {bookings.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-6">No bookings yet</div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b, idx) => {
                  const isPaid = b.paymentStatus === "PAID"
                  const isUpdating = updating === b.id

                  return (
                    <div key={b.id} className={cn("rounded-xl p-4 border-2 shadow-sm", b.checkedIn ? "border-green-300 bg-green-50" : "border-gray-200 bg-white")}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          <div className="font-semibold text-gray-900">{b.clientName}</div>
                        </div>
                        {b.checkedIn && <span className="text-[10px] font-medium text-green-700 bg-green-200 px-2 py-0.5 rounded-full">✓ checked in</span>}
                      </div>
                      <div className="text-xs text-gray-400 ml-8 mb-3">{b.clientPhone}</div>

                      {/* Code verification */}
                      {!b.checkedIn && (
                        <div className="ml-8 mb-3 flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={3}
                            placeholder="000"
                            value={verifyCodes[b.id] ?? ""}
                            onChange={(e) => {
                              const code = e.target.value.replace(/\D/g, "").slice(0, 3)
                              setVerifyCodes((prev) => ({ ...prev, [b.id]: code }))
                              if (verifyStates[b.id]) setVerifyStates((prev) => ({ ...prev, [b.id]: "idle" }))
                              if (code.length === 3) handleVerify(b.id, code)
                            }}
                            className={cn(
                              "w-20 border-2 rounded-lg px-2 py-1.5 text-base font-mono tracking-widest text-center focus:outline-none transition-colors",
                              !verifyStates[b.id] || verifyStates[b.id] === "idle"
                                ? "border-gray-200 bg-white text-gray-700 focus:border-[#2C6E49]"
                                : verifyStates[b.id] === "ok"
                                ? "border-green-400 bg-green-50 text-green-800"
                                : "border-red-400 bg-red-50 text-red-700"
                            )}
                          />
                          {verifyStates[b.id] === "ok" && <span className="text-green-500 text-xl font-bold">✓</span>}
                          {verifyStates[b.id] === "error" && <span className="text-red-400 text-sm">Wrong code</span>}
                          {(!verifyStates[b.id] || verifyStates[b.id] === "idle") && (
                            <span className="text-xs text-gray-400">Client code</span>
                          )}
                        </div>
                      )}

                      {/* Payment method buttons */}
                      <div className="mt-3">
                        <div className="text-xs text-gray-400 mb-1.5">Payment method</div>
                        <div className="grid grid-cols-4 gap-1">
                          {PAYMENT_METHODS.map((pm) => {
                            const isActive = b.paymentType === pm.value
                            return (
                              <button
                                key={pm.value}
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handlePaymentMethod(b, pm.value)}
                                className={cn(
                                  "py-1.5 rounded-lg text-xs font-medium transition-all border",
                                  isActive
                                    ? "bg-[#2C6E49] text-white border-[#2C6E49]"
                                    : "bg-white text-gray-500 border-gray-200 hover:border-[#2C6E49]/40 hover:text-[#2C6E49]",
                                  isUpdating && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                {pm.label}
                              </button>
                            )
                          })}
                        </div>
                        {isPaid && (
                          <div className="mt-1 text-[10px] text-[#2C6E49] font-medium">
                            ✓ Paid · {b.paymentType}
                          </div>
                        )}
                      </div>

                      {/* Services checklist */}
                      {services.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs text-gray-400 mb-1.5">Services</div>
                          <div className="space-y-1">
                            {services.map((svc) => {
                              const hasService = b.services.some((s) => s.service.id === svc.id)
                              return (
                                <label key={svc.id} className={cn("flex items-center gap-2 cursor-pointer", isUpdating && "opacity-50 cursor-not-allowed")}>
                                  <input
                                    type="checkbox"
                                    checked={hasService}
                                    disabled={isUpdating}
                                    onChange={() => toggleService(b, svc.id)}
                                    className="w-3.5 h-3.5 rounded accent-[#2C6E49]"
                                  />
                                  <span className="text-xs text-gray-700 flex-1">{svc.name}</span>
                                  <span className="text-[10px] text-gray-400">+{formatIDR(svc.price)}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      <div className="mt-3">
                        <label className="block text-xs text-gray-400 mb-1">Notes</label>
                        <input
                          type="text"
                          defaultValue={b.notes ?? ""}
                          disabled={isUpdating}
                          onBlur={(e) => {
                            if (e.target.value !== (b.notes ?? "")) {
                              updateBooking(b.id, { notes: e.target.value })
                            }
                          }}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-full focus:outline-none disabled:opacity-50"
                          placeholder="Add note..."
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
