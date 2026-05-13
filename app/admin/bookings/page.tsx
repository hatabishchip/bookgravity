"use client"

import { useState, useEffect, useCallback } from "react"
import { format } from "date-fns"
import { Search, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

type Booking = {
  id: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientTelegram?: string
  status: string
  paymentType: string
  paymentStatus: string
  notes?: string
  createdAt: string
  slot: {
    date: string
    startTime: string
    endTime: string
    trainer: { name: string }
  }
  services: { service: { name: string; price: number } }[]
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
}

const paymentBadge = (type: string, status: string) => {
  if (type === "ONLINE" && status === "PAID") return { label: "Paid Online", cls: "bg-green-50 text-green-700" }
  if (type === "OFFLINE" && status === "PAID") return { label: "Paid Offline", cls: "bg-blue-50 text-blue-700" }
  return { label: "Unpaid", cls: "bg-yellow-50 text-yellow-700" }
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [search, setSearch] = useState("")
  const [dateFilter, setDateFilter] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchBookings = useCallback(async () => {
    const url = dateFilter ? `/api/admin/bookings?date=${dateFilter}` : "/api/admin/bookings"
    const res = await fetch(url)
    const data = await res.json()
    setBookings(data)
  }, [dateFilter])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  const updateBooking = async (id: string, data: Record<string, string>) => {
    setUpdating(id)
    await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    await fetchBookings()
    setUpdating(null)
  }

  const filtered = bookings.filter((b) =>
    !search ||
    b.clientName.toLowerCase().includes(search.toLowerCase()) ||
    b.clientEmail.toLowerCase().includes(search.toLowerCase()) ||
    b.clientPhone.includes(search)
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bookings</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
          />
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] bg-white"
        />
        {dateFilter && (
          <button onClick={() => setDateFilter("")} className="text-sm text-gray-500 hover:text-gray-800 px-2">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_40px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div>Client</div>
          <div>Session</div>
          <div>Trainer</div>
          <div>Payment</div>
          <div>Booked</div>
          <div />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No bookings found</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((b) => {
              const badge = paymentBadge(b.paymentType, b.paymentStatus)
              const isExpanded = expandedId === b.id

              return (
                <div key={b.id}>
                  <div
                    className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_40px] gap-4 px-6 py-4 items-center hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : b.id)}
                  >
                    <div>
                      <div className="font-medium text-sm text-gray-800">{b.clientName}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{b.clientEmail}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-800">
                        {format(new Date(b.slot.date), "MMM d, yyyy")}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formatTime(b.slot.startTime)} – {formatTime(b.slot.endTime)}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">{b.slot.trainer.name}</div>
                    <div>
                      <span className={cn("text-xs px-2 py-1 rounded-full font-medium", badge.cls)}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {format(new Date(b.createdAt), "MMM d")}
                    </div>
                    <div>
                      <ChevronDown size={16} className={cn("text-gray-400 transition-transform", isExpanded && "rotate-180")} />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-6 pb-5 bg-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-3 gap-6 pt-4">
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Contact</div>
                          <div className="text-sm text-gray-700">{b.clientPhone}</div>
                          {b.clientTelegram && <div className="text-sm text-gray-700">{b.clientTelegram}</div>}
                        </div>

                        {b.services.length > 0 && (
                          <div>
                            <div className="text-xs text-gray-400 mb-1">Additional Services</div>
                            {b.services.map((s, i) => (
                              <div key={i} className="text-sm text-gray-700">{s.service.name} — {Math.round(s.service.price / 1000)}K IDR</div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Payment Type</label>
                            <select
                              value={b.paymentType}
                              disabled={updating === b.id}
                              onChange={(e) => updateBooking(b.id, { paymentType: e.target.value })}
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
                            >
                              <option value="PENDING">Pending</option>
                              <option value="ONLINE">Online</option>
                              <option value="OFFLINE">Offline</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Payment Status</label>
                            <select
                              value={b.paymentStatus}
                              disabled={updating === b.id}
                              onChange={(e) => updateBooking(b.id, { paymentStatus: e.target.value })}
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
                            >
                              <option value="UNPAID">Unpaid</option>
                              <option value="PAID">Paid</option>
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
                              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
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
        )}
      </div>
    </div>
  )
}
