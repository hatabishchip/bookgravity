"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Trash2, X, Package } from "lucide-react"

type Service = { id: string; name: string; price: number; active: boolean }

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", price: "" })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchServices = useCallback(async () => {
    const res = await fetch("/api/admin/services")
    const data = await res.json()
    setServices(data)
  }, [])

  useEffect(() => { fetchServices() }, [fetchServices])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    await fetch("/api/admin/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, price: parseFloat(form.price) }),
    })

    await fetchServices()
    setShowForm(false)
    setForm({ name: "", price: "" })
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this service? Existing bookings won't be affected.")) return
    setDeleting(id)
    await fetch(`/api/admin/services?id=${id}`, { method: "DELETE" })
    await fetchServices()
    setDeleting(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Additional Services</h1>
          <p className="text-gray-500 text-sm mt-1">Clients can add these during booking</p>
        </div>
        {services.length < 3 && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#2C6E49] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#1E4D34] transition-colors"
          >
            <Plus size={16} />
            Add Service
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
          <div key={service.id} className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 bg-[#2C6E49]/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Package size={18} className="text-[#2C6E49]" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-800">{service.name}</div>
            </div>
            <div className="text-lg font-bold text-[#2C6E49]">${service.price}</div>
            <button
              onClick={() => handleDelete(service.id)}
              disabled={deleting === service.id}
              className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800">Add Service</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Price (USD)</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  placeholder="5.00"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-[#2C6E49] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60">
                  {saving ? "Saving..." : "Add Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
