"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Trash2, X, Package, Pencil, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { PriceInput } from "@/app/_components/PriceInput"

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
    const res = await fetch(`/api/admin/services?id=${id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? `Failed to delete (HTTP ${res.status})`)
    }
    await fetchServices()
    setDeleting(null)
  }

  // Toggle visibility — optimistic flip locally, then PATCH active in the
  // background. Clients only see services where active=true (filter is on
  // every public endpoint that returns the additional-services list).
  const handleToggleActive = async (e: React.MouseEvent, service: Service) => {
    e.stopPropagation()
    const nextActive = !service.active
    setServices((prev) => prev.map((s) => (s.id === service.id ? { ...s, active: nextActive } : s)))
    const res = await fetch("/api/admin/services", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: service.id, active: nextActive }),
    })
    if (!res.ok) {
      // Revert on failure
      setServices((prev) => prev.map((s) => (s.id === service.id ? { ...s, active: service.active } : s)))
    }
  }

  return (
    <div className="space-y-8">
      <MainServicesCard />

      <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Additional Services</h1>
          <p className="text-gray-500 text-xs lg:text-sm mt-1 truncate">Tap a service to edit · Clients can add these during booking</p>
        </div>
        {services.filter((s) => s.active).length < 3 && (
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

      {services.filter((s) => s.active).length >= 3 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm px-4 py-3 rounded-xl mb-4">
          Maximum 3 visible services. Hide one with the eye toggle to add another.
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
            className={cn(
              "w-full rounded-2xl p-4 lg:p-5 shadow-sm flex items-center gap-3 lg:gap-4 transition-all cursor-pointer border",
              service.active
                ? "bg-white border-transparent hover:shadow-md hover:bg-gray-50"
                : "bg-gray-50 border-dashed border-gray-300 hover:bg-gray-100",
            )}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                service.active ? "bg-[#2C6E49]/10" : "bg-gray-200",
              )}
            >
              <Package size={18} className={service.active ? "text-[#2C6E49]" : "text-gray-400"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("font-semibold truncate", service.active ? "text-gray-800" : "text-gray-500")}>
                  {service.name}
                </span>
                {!service.active && (
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                    Hidden
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Pencil size={10} /> tap to edit
              </div>
            </div>
            <div className={cn("text-lg font-bold flex-shrink-0", service.active ? "text-[#2C6E49]" : "text-gray-400")}>
              {priceToK(service.price)}k
            </div>

            {/* Visibility toggle — clients only see services where active=true. */}
            <button
              type="button"
              onClick={(e) => handleToggleActive(e, service)}
              title={service.active ? "Visible to clients — tap to hide" : "Hidden from clients — tap to show"}
              aria-label={service.active ? "Hide from clients" : "Show to clients"}
              className={cn(
                "p-2 rounded-lg transition-colors flex-shrink-0 border",
                service.active
                  ? "bg-white text-[#2C6E49] border-[#2C6E49]/30 hover:bg-[#2C6E49]/10"
                  : "bg-white text-gray-400 border-gray-200 hover:bg-gray-100",
              )}
            >
              {service.active ? <Eye size={15} strokeWidth={2.25} /> : <EyeOff size={15} strokeWidth={2.25} />}
            </button>

            <button
              type="button"
              onClick={(e) => handleDelete(e, service.id)}
              disabled={deleting === service.id}
              className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
              aria-label="Delete service"
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
    </div>
  )
}

type StudioPrices = {
  groupPrice: number
  kidsPrice: number
  privatePrice: number
}

function formatPriceShort(p: number) {
  if (p >= 1_000_000) {
    const m = p / 1_000_000
    const s = m % 1 === 0 ? m.toString() : m.toFixed(1).replace(/\.0$/, "")
    return `${s}M`
  }
  return `${Math.round(p / 1000)}k`
}

type MainKind = "GROUP" | "KIDS" | "PRIVATE"

function MainServicesCard() {
  const [studio, setStudio] = useState<StudioPrices | null>(null)
  const [editing, setEditing] = useState<MainKind | null>(null)
  const [draftValue, setDraftValue] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/admin/studio").then((r) => r.json()).then((d) => {
      setStudio({ groupPrice: d.groupPrice, kidsPrice: d.kidsPrice, privatePrice: d.privatePrice })
    })
  }, [])

  const items: { kind: MainKind; field: keyof StudioPrices; label: string; sub: string }[] = [
    { kind: "GROUP", field: "groupPrice", label: "Group class", sub: "Adults, up to 6 people" },
    { kind: "KIDS", field: "kidsPrice", label: "Kids class", sub: "Children's group" },
    { kind: "PRIVATE", field: "privatePrice", label: "Private session", sub: "1 person only" },
  ]

  const startEdit = (kind: MainKind, value: number) => {
    setEditing(kind)
    setDraftValue(value)
  }

  const cancelEdit = () => setEditing(null)

  const save = async (field: keyof StudioPrices) => {
    if (!studio) return
    setSaving(true)
    const res = await fetch("/api/admin/studio", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: draftValue }),
    })
    if (res.ok) {
      const updated = await res.json()
      setStudio({ groupPrice: updated.groupPrice, kidsPrice: updated.kidsPrice, privatePrice: updated.privatePrice })
      setEditing(null)
    }
    setSaving(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Main Services</h1>
        <p className="text-gray-500 text-xs lg:text-sm mt-1">Default prices for each class type · used when creating slots</p>
      </div>
      {!studio ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-3">
          {items.map(({ kind, field, label, sub }) => {
            const value = studio[field]
            const isEditing = editing === kind
            return (
              <div key={kind} className="w-full bg-white rounded-2xl p-4 lg:p-5 shadow-sm flex items-center gap-3 lg:gap-4">
                <div className="w-10 h-10 bg-[#2C6E49]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Package size={18} className="text-[#2C6E49]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 truncate">{label}</div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">{sub}</div>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <PriceInput
                      value={draftValue}
                      onChange={setDraftValue}
                      className="w-28 sm:w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                    />
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="px-2 py-2 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => save(field)}
                      disabled={saving || draftValue === value}
                      className="px-3 py-2 rounded-lg bg-[#2C6E49] text-white text-xs font-medium hover:bg-[#1E4D34] disabled:opacity-50"
                    >
                      {saving ? "…" : "Save"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-lg font-bold text-[#2C6E49] flex-shrink-0">
                      {formatPriceShort(value)}
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(kind, value)}
                      title="Edit price"
                      className="p-2 hover:bg-[#2C6E49]/5 rounded-lg text-gray-400 hover:text-[#2C6E49] flex-shrink-0"
                    >
                      <Pencil size={14} />
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
