"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Plus, Trash2, X, User, CalendarDays, Pencil, Check } from "lucide-react"
import TrainerSchedule from "./TrainerSchedule"
import PhoneInput from "@/app/_components/PhoneInput"
import { formatPhoneInput, validatePhone } from "@/lib/phone"

const COLOR_OPTIONS = [
  { value: "#6366F1", label: "Indigo" },
  { value: "#E76F51", label: "Orange" },
  { value: "#457B9D", label: "Steel Blue" },
  { value: "#E63946", label: "Red" },
  { value: "#F4A261", label: "Amber" },
  { value: "#7C3AED", label: "Purple" },
  { value: "#0891B2", label: "Teal" },
  { value: "#D97706", label: "Gold" },
  { value: "#BE185D", label: "Pink" },
  { value: "#64748B", label: "Slate" },
]

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

type Trainer = {
  id: string
  name: string
  whatsapp: string
  commissionRate: number
  color: string
  user: { email: string }
}

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Change color"
        className="w-5 h-5 rounded-full border-2 border-white shadow-sm ring-1 ring-black/10 transition-transform hover:scale-110"
        style={{ backgroundColor: color }}
      />
      {open && (
        <div className="absolute top-7 left-0 z-20 bg-white rounded-xl shadow-xl border border-gray-100 p-2.5 flex flex-col gap-1 min-w-[140px]">
          <div className="grid grid-cols-5 gap-1.5 mb-1">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110 ring-offset-1"
                style={{
                  backgroundColor: opt.value,
                  outline: color === opt.value ? `2px solid ${opt.value}` : "none",
                  outlineOffset: "2px",
                }}
              />
            ))}
          </div>
          <p className="text-[10px] text-gray-400 text-center">{COLOR_OPTIONS.find((o) => o.value === color)?.label}</p>
        </div>
      )}
    </div>
  )
}

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", password: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)
  const [scheduleFor, setScheduleFor] = useState<Trainer | null>(null)

  const fetchTrainers = useCallback(async () => {
    const res = await fetch("/api/admin/trainers")
    const data = (await res.json()) as Trainer[]
    // Format raw whatsapp values from the DB so the field renders pretty
    // ("+62 821-4554-6405") instead of "+6282145546405".
    setTrainers(
      data.map((t) => ({
        ...t,
        whatsapp: t.whatsapp ? formatPhoneInput(t.whatsapp) : "",
      })),
    )
  }, [])

  useEffect(() => { fetchTrainers() }, [fetchTrainers])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError("")
    const res = await fetch("/api/admin/trainers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (!res.ok) { const err = await res.json(); setError(err.error || "Failed to create trainer"); setSaving(false); return }
    await fetchTrainers()
    setShowForm(false); setForm({ name: "", email: "", password: "" }); setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this trainer? This will also delete their account.")) return
    setDeleting(id)
    await fetch(`/api/admin/trainers?id=${id}`, { method: "DELETE" })
    await fetchTrainers(); setDeleting(null)
  }


  const handleColorChange = async (id: string, color: string) => {
    setTrainers((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)))
    await fetch(`/api/admin/trainers?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    })
  }

  // Track which field is currently in "edit" mode per trainer. Only one
  // field per trainer can be edited at a time. Once saved/cancelled the
  // entry is dropped and the row goes back to read-only.
  const [editing, setEditing] = useState<Record<string, "name" | "email" | "phone" | undefined>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [editError, setEditError] = useState<Record<string, string | undefined>>({})

  const startEdit = (id: string, field: "name" | "email" | "phone", initial: string) => {
    setEditing((prev) => ({ ...prev, [id]: field }))
    setDraft((prev) => ({ ...prev, [id]: initial }))
    setEditError((prev) => ({ ...prev, [id]: undefined }))
  }

  const cancelEdit = (id: string) => {
    setEditing((prev) => ({ ...prev, [id]: undefined }))
    setDraft((prev) => {
      const { [id]: _drop, ...rest } = prev
      return rest
    })
    setEditError((prev) => ({ ...prev, [id]: undefined }))
  }

  const saveEdit = async (id: string) => {
    const field = editing[id]
    if (!field) return
    const value = (draft[id] ?? "").trim()
    const trainer = trainers.find((t) => t.id === id)
    if (!trainer) return

    // Field-specific validation
    let body: Record<string, string>
    if (field === "name") {
      if (value.length < 2) {
        setEditError((p) => ({ ...p, [id]: "Минимум 2 символа" }))
        return
      }
      body = { name: value }
    } else if (field === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setEditError((p) => ({ ...p, [id]: "Неверный email" }))
        return
      }
      body = { email: value }
    } else {
      // phone — accept empty (clearing) or fully valid
      const v = validatePhone(value)
      if (!(value === "" || v.kind === "ok")) {
        setEditError((p) => ({ ...p, [id]: "Номер некорректен" }))
        return
      }
      body = { whatsapp: value }
    }

    const res = await fetch(`/api/admin/trainers?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setEditError((p) => ({ ...p, [id]: data.error ?? `HTTP ${res.status}` }))
      return
    }
    const updated = await res.json()
    setTrainers((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              name: updated.name ?? t.name,
              user: updated.user ?? t.user,
              whatsapp: updated.whatsapp ? formatPhoneInput(updated.whatsapp) : "",
            }
          : t,
      ),
    )
    cancelEdit(id)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Trainers</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-[#2C6E49] text-white px-3 lg:px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#1E4D34] transition-colors flex-shrink-0"
        >
          <Plus size={16} /> <span className="hidden sm:inline">Add Trainer</span><span className="sm:hidden">Add</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {trainers.map((trainer) => (
          <div
            key={trainer.id}
            className="rounded-2xl p-5 shadow-sm bg-white border border-gray-100"
          >
            {/* Header row */}
            <div className="flex items-start gap-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border-2"
                style={{ backgroundColor: hexToRgba(trainer.color, 0.15), borderColor: trainer.color }}
              >
                <User size={20} style={{ color: trainer.color }} />
              </div>
              <div className="flex-1 min-w-0">
                {/* Name: display + pencil; click pencil → inline input. */}
                {editing[trainer.id] === "name" ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={draft[trainer.id] ?? ""}
                      onChange={(e) => setDraft((p) => ({ ...p, [trainer.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(trainer.id)
                        else if (e.key === "Escape") cancelEdit(trainer.id)
                      }}
                      className="flex-1 min-w-0 font-semibold text-gray-900 border border-[#2C6E49]/30 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
                    />
                    <button
                      onClick={() => saveEdit(trainer.id)}
                      className="p-1 text-[#2C6E49] hover:bg-[#2C6E49]/10 rounded"
                      aria-label="Save name"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => cancelEdit(trainer.id)}
                      className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                      aria-label="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: trainer.color }}
                    />
                    <span className="truncate">{trainer.name}</span>
                    <button
                      onClick={() => startEdit(trainer.id, "name", trainer.name)}
                      className="p-1 text-gray-300 hover:text-[#2C6E49] hover:bg-[#2C6E49]/10 rounded"
                      aria-label="Edit name"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}

                {/* Email: display + pencil. */}
                {editing[trainer.id] === "email" ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <input
                      autoFocus
                      type="email"
                      value={draft[trainer.id] ?? ""}
                      onChange={(e) => setDraft((p) => ({ ...p, [trainer.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(trainer.id)
                        else if (e.key === "Escape") cancelEdit(trainer.id)
                      }}
                      className="flex-1 min-w-0 text-sm text-gray-700 border border-[#2C6E49]/30 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
                    />
                    <button
                      onClick={() => saveEdit(trainer.id)}
                      className="p-1 text-[#2C6E49] hover:bg-[#2C6E49]/10 rounded"
                      aria-label="Save email"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => cancelEdit(trainer.id)}
                      className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                      aria-label="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <span className="truncate min-w-0">{trainer.user.email}</span>
                    <button
                      onClick={() => startEdit(trainer.id, "email", trainer.user.email)}
                      className="p-1 text-gray-300 hover:text-[#2C6E49] hover:bg-[#2C6E49]/10 rounded flex-shrink-0"
                      aria-label="Edit email"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}

                {/* WhatsApp: read-only chip + pencil; click → inline PhoneInput
                    with Save/Cancel. Save only fires when validation passes. */}
                {editing[trainer.id] === "phone" ? (
                  <div className="mt-1.5">
                    <PhoneInput
                      compact
                      autoFocus
                      value={draft[trainer.id] ?? ""}
                      onChange={(next) => setDraft((p) => ({ ...p, [trainer.id]: next }))}
                    />
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button
                        onClick={() => saveEdit(trainer.id)}
                        className="text-xs px-2 py-1 bg-[#2C6E49] text-white rounded-lg hover:bg-[#1E4D34] flex items-center gap-1"
                      >
                        <Check size={12} /> Сохранить
                      </button>
                      <button
                        onClick={() => cancelEdit(trainer.id)}
                        className="text-xs px-2 py-1 text-gray-500 hover:bg-gray-100 rounded-lg flex items-center gap-1"
                      >
                        <X size={12} /> Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 truncate min-w-0 flex-1">
                      {trainer.whatsapp || (
                        <span className="text-gray-300">WhatsApp number</span>
                      )}
                    </span>
                    <button
                      onClick={() => startEdit(trainer.id, "phone", trainer.whatsapp || "")}
                      className="p-1 text-gray-300 hover:text-[#2C6E49] hover:bg-[#2C6E49]/10 rounded flex-shrink-0"
                      aria-label="Edit WhatsApp"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}

                {editError[trainer.id] && (
                  <p className="text-xs text-red-500 mt-1">{editError[trainer.id]}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(trainer.id)}
                disabled={deleting === trainer.id}
                className="p-1.5 hover:bg-black/5 rounded-lg text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Divider */}
            <div className="my-4 border-t border-black/6" />

            {/* Color */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Schedule color</span>
                <ColorPicker color={trainer.color} onChange={(c) => handleColorChange(trainer.id, c)} />
              </div>
            </div>

            {/* View Schedule */}
            <button
              onClick={() => setScheduleFor(trainer)}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-white/70 hover:bg-white/90 border border-black/8 text-gray-700 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              <CalendarDays size={14} />
              View Schedule
            </button>
          </div>
        ))}

        {trainers.length === 0 && (
          <div className="col-span-1 lg:col-span-3 text-center py-12 text-gray-400 text-sm">
            No trainers yet. Add your first trainer.
          </div>
        )}
      </div>

      {/* Trainer schedule overlay */}
      {scheduleFor && (
        <TrainerSchedule trainer={scheduleFor} onClose={() => setScheduleFor(null)} />
      )}

      {/* Add trainer modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800">Add Trainer</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input required type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  placeholder="Trainer name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (for login)</label>
                <input required type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  placeholder="trainer@gravity.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input required type="password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
                  placeholder="Min. 6 characters"
                  minLength={6}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-[#2C6E49] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60">
                  {saving ? "Creating..." : "Create Trainer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
