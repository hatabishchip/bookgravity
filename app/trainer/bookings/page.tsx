"use client"

import { useState, useEffect, useCallback } from "react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

type Booking = {
  id: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientTelegram?: string
  paymentType: string
  paymentStatus: string
  notes?: string
  createdAt: string
  slot: { date: string; startTime: string; endTime: string }
  services: { service: { name: string; price: number } }[]
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
}

export default function TrainerBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [updating, setUpdating] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchBookings = useCallback(async () => {
    const res = await fetch("/api/trainer/bookings")
    const data = await res.json()
    setBookings(data)
  }, [])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  const updateBooking = async (id: string, data: Record<string, string>) => {
    setUpdating(id)
    await fetch(`/api/trainer/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    await fetchBookings()
    setUpdating(null)
  }

  const paymentBadge = (type: string, status: string) => {
    if (type === "ONLINE" && status === "PAID") return { label: "Paid Online", cls: "bg-green-50 text-green-700" }
    if (type === "OFFLINE" && status === "PAID") return { label: "Paid Offline", cls: "bg-blue-50 text-blue-700" }
    return { label: "Unpaid", cls: "bg-yellow-50 text-yellow-700" }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">All My Bookings</h1>

      {bookings.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400 text-sm shadow-sm">
          No bookings yet
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {bookings.map((b) => {
              const badge = paymentBadge(b.paymentType, b.paymentStatus)
              const isExpanded = expandedId === b.id

              return (
                <div key={b.id}>
                  <div
                    className="px-6 py-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                    onClick={() => setExpandedId(isExpanded ? null : b.id)}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div>
                        <div className="font-medium text-sm text-gray-800">{b.clientName}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{b.clientPhone}</div>
                      </div>
                      <div className="text-sm text-gray-600">
                        {format(new Date(b.slot.date), "MMM d")} · {formatTime(b.slot.startTime)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("text-xs px-2 py-1 rounded-full font-medium", badge.cls)}>
                        {badge.label}
                      </span>
                      <span className="text-gray-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-6 pb-5 bg-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-3 gap-6 pt-4">
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Contact</div>
                          <div className="text-sm text-gray-700">{b.clientEmail}</div>
                          {b.clientTelegram && <div className="text-sm text-gray-700">{b.clientTelegram}</div>}
                        </div>

                        {b.services.length > 0 && (
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Services</div>
                            {b.services.map((s, i) => (
                              <div key={i} className="text-sm text-gray-700">{s.service.name}</div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Payment</label>
                            <select
                              value={b.paymentType === "PENDING" ? "" : `${b.paymentType}_${b.paymentStatus}`}
                              disabled={updating === b.id}
                              onChange={(e) => {
                                const [type, status] = e.target.value.split("_")
                                updateBooking(b.id, { paymentType: type, paymentStatus: status })
                              }}
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none"
                            >
                              <option value="">Not set</option>
                              <option value="ONLINE_PAID">Paid Online</option>
                              <option value="OFFLINE_PAID">Paid Offline</option>
                              <option value="OFFLINE_UNPAID">Offline / Unpaid</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Notes</label>
                            <input
                              type="text"
                              defaultValue={b.notes ?? ""}
                              onBlur={(e) => {
                                if (e.target.value !== (b.notes ?? "")) {
                                  updateBooking(b.id, { notes: e.target.value })
                                }
                              }}
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none"
                              placeholder="Add note..."
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
