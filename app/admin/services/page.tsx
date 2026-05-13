"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Trash2, X, Package, Pencil } from "lucide-react"

type Service = { id: string; name: string; price: number; active: boolean }

// Price stored in DB as full IDR (e.g. 50000). UI shows "K" units (e.g. 50).
function priceToK(price: number) {
  return Math.round(price / 1000)
}
function kToPrice(k: number) {
  return k * 1000
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [editing, setEditing] = useState<Service | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", priceK: "50" })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchServices = useCallback(async () => {
    const res = await fetch("/api/admin/services")
    const data = await res.json()
    setServices(data)
  }, [])

  useEffect(() => { fetchServices() }, [fetchServices])

  const openEdit = (service: Service) => {
    setEditing(service)
    setForm({ name: service.name, priceK: String(priceToK(service.price)) })
    setShowForm(true)
  }

  const openAdd = () => {
    setEditing(null)
    setForm({ name: "", priceK: "50" })
    setShowForm(true)
  }

  const closeModal = () => {
    setShowForm(false)
    setEditing(null)
    setForm({ name: "", priceK: "50" })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const k = parseInt(form.priceK, 10) || 0
    const price = kToPrice(k)

    if (editing) {
      await fetch("/api/admin/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, name: form.name, price }),
      })
    } else {
      await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, price }),
      })
    }

    await fetchServices()
    closeModal()
    setSaving(false)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm("Remove this service? Existing bookings won't be affected.")) return
    setDeleting(id)
    await fetch(`/api/admin/services?id=${id}`, { method: "DELETE" })
    await fetchServices()
    setDeleting(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Additional Services</h1>
          <p className="text-gray-500 text-xs lg:text-sm mt-1 truncate">Tap a service to edit · Clients can add these during booking</p>
        </div>
        {services.length < 3 && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-[#2C6E49] text-white px-3 lg:px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#1E4D34] transition-colors flex-shrink-0"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add Service</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {services.length >= 3 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm px-4 py-3 rounded-xl mb-4">
          Maximum 3 additional services allowed.
        </div>
      )}

      <div className="space-y-3">
        {services.map((service) => (
          <div
            key={service.id}
            onClick={() => openEdit(service)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openEdit(service) }}
            className="w-full bg-white rounded-2xl p-4 lg:p-5 shadow-sm flex items-center gap-3 lg:gap-4 hover:shadow-md hover:bg-gray-50 transition-all cursor-pointer"
          >
            <div className="w-10 h-10 bg-[#2C6E49]/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Package size={18} className="text-[#2C6E49]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-800 truncate">{service.name}</div>
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Pencil size={10} /> tap to edit
              </div>
            </div>
            <div className="text-lg font-bold text-[#2C6E49] flex-shrink-0">
              {priceToK(service.price)}k
            </div>
            <button
              type="button"
              onClick={(e) => handleDelete(e, service.id)}
              disabled={deleting === service.id}
              className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

        {services.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-2xl">
            No additional services yet.
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800">
                {editing ? "Edit Service" : "Add Service"}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Name</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  placeholder="e.g. Mat Rental"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price (IDR)</label>
                <div className="relative">
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={form.priceK}
                    onChange={(e) => setForm({ ...form, priceK: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                    placeholder="50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400 pointer-events-none">k</span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  = Rp {(parseInt(form.priceK, 10) || 0).toLocaleString("id-ID")}.000
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-[#2C6E49] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60">
                  {saving ? "Saving..." : editing ? "Save Changes" : "Add Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
