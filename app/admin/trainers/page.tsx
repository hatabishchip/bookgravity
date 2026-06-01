"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Plus, Trash2, X, User, CalendarDays, Pencil, Check } from "lucide-react"
import TrainerSchedule from "./TrainerSchedule"
import PhoneInput from "@/app/_components/PhoneInput"
import { formatPhoneInput, validatePhone } from "@/lib/phone"
import { WhatsAppIcon } from "@/app/_components/WhatsAppIcon"
import { whatsappLink } from "@/lib/whatsapp"
import { formatDistanceToNow } from "date-fns"

// 18 bright, well-separated hues so trainers are easy to tell apart on the
// schedule. Spread around the colour wheel; all vivid (no muted greys).
const COLOR_OPTIONS = [
  { value: "#EF4444", label: "Red" },
  { value: "#F97316", label: "Orange" },
  { value: "#F59E0B", label: "Amber" },
  { value: "#FACC15", label: "Yellow" },
  { value: "#84CC16", label: "Lime" },
  { value: "#22C55E", label: "Green" },
  { value: "#10B981", label: "Emerald" },
  { value: "#14B8A6", label: "Teal" },
  { value: "#06B6D4", label: "Cyan" },
  { value: "#0EA5E9", label: "Sky" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#6366F1", label: "Indigo" },
  { value: "#8B5CF6", label: "Violet" },
  { value: "#A855F7", label: "Purple" },
  { value: "#D946EF", label: "Fuchsia" },
  { value: "#EC4899", label: "Pink" },
  { value: "#F43F5E", label: "Rose" },
  { value: "#BE185D", label: "Crimson" },
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
  user: { email: string; initialPassword?: string | null }
  /** Latest web/mobile activity; null if the trainer never signed in. */
  lastActiveAt?: string | null
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
        // Anchor to the right edge of the swatch so the popup opens LEFTWARD
        // into the card. The swatch sits on the right side of the row, so a
        // left-anchored popup would overflow off-screen on mobile (only the
        // first 4 colors would be visible). Right-anchored = always inside.
        <div className="absolute top-7 right-0 z-20 bg-white rounded-xl shadow-xl border border-gray-100 p-3.5 flex flex-col gap-2 min-w-[220px]">
          <div className="grid grid-cols-5 gap-3 mb-1">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className="w-7 h-7 rounded-full transition-transform hover:scale-110 ring-offset-1 touch-manipulation"
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
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "" })
  // After creating, show the auto-generated 4-digit starter password once.
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null)
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
    if (form.whatsapp.trim() !== "") {
      const v = validatePhone(form.whatsapp)
      if (v.kind !== "ok") { setError("WhatsApp number is incomplete or invalid"); return }
    }
    setSaving(true); setError("")
    const res = await fetch("/api/admin/trainers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || "Failed to create trainer"); setSaving(false); return }
    await fetchTrainers()
    // Show the generated starter password so the admin can pass it on.
    setCreated({ name: form.name, email: form.email.trim().toLowerCase(), password: data.initialPassword })
    setForm({ name: "", email: "", whatsapp: "" }); setSaving(false)
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

  // Single "edit mode" per trainer card. Clicking the pencil flips the card
  // into a draft where all three fields (name / email / WhatsApp) become
  // editable at once; one Save patches them all in one PATCH call.
  type EditDraft = { name: string; email: string; whatsapp: string }
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>({ name: "", email: "", whatsapp: "" })
  const [editError, setEditError] = useState<string | null>(null)

  const startEdit = (t: Trainer) => {
    setEditingId(t.id)
    setDraft({ name: t.name, email: t.user.email, whatsapp: t.whatsapp ?? "" })
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditError(null)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const name = draft.name.trim()
    const email = draft.email.trim()
    const whatsapp = draft.whatsapp.trim()

    if (name.length < 2) { setEditError("Имя — минимум 2 символа"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEditError("Неверный email"); return }
    if (whatsapp !== "") {
      const v = validatePhone(whatsapp)
      if (v.kind !== "ok") { setEditError("Номер WhatsApp некорректен"); return }
    }

    const body = { name, email, whatsapp }
    const res = await fetch(`/api/admin/trainers?id=${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setEditError(data.error ?? `HTTP ${res.status}`)
      return
    }
    const updated = await res.json()
    setTrainers((prev) =>
      prev.map((t) =>
        t.id === editingId
          ? {
              ...t,
              name: updated.name ?? t.name,
              user: updated.user ?? t.user,
              whatsapp: updated.whatsapp ? formatPhoneInput(updated.whatsapp) : "",
            }
          : t,
      ),
    )
    cancelEdit()
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
                {editingId === trainer.id ? (
                  // EDIT MODE: name + email + WhatsApp all editable at once.
                  // Single Save / Cancel pair below.
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Name</label>
                      <input
                        autoFocus
                        value={draft.name}
                        onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit()
                          else if (e.key === "Escape") cancelEdit()
                        }}
                        className="w-full font-semibold text-gray-900 border border-[#2C6E49]/30 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Email</label>
                      <input
                        type="email"
                        value={draft.email}
                        onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit()
                          else if (e.key === "Escape") cancelEdit()
                        }}
                        className="w-full text-sm text-gray-700 border border-[#2C6E49]/30 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">WhatsApp</label>
                      <PhoneInput
                        compact
                        value={draft.whatsapp}
                        onChange={(next) => setDraft((p) => ({ ...p, whatsapp: next }))}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={saveEdit}
                        className="text-xs px-3 py-1.5 bg-[#2C6E49] text-white rounded-lg hover:bg-[#1E4D34] flex items-center gap-1 font-medium"
                      >
                        <Check size={12} /> Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-xs px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg flex items-center gap-1"
                      >
                        <X size={12} /> Cancel
                      </button>
                    </div>
                    {editError && <p className="text-xs text-red-500 mt-1">{editError}</p>}
                  </div>
                ) : (
                  // VIEW MODE: read-only name + email + WhatsApp chip.
                  <>
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: trainer.color }}
                      />
                      <span className="truncate">{trainer.name}</span>
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5 truncate">{trainer.user.email}</div>
                    <div className="text-xs mt-0.5">
                      {trainer.user.initialPassword
                        ? <span className="text-gray-500">password: <span className="font-mono font-semibold text-gray-700">{trainer.user.initialPassword}</span></span>
                        : (
                          // Password changed → don't show stars; show last login instead.
                          <span className="text-gray-400">
                            {trainer.lastActiveAt
                              ? `last active ${formatDistanceToNow(new Date(trainer.lastActiveAt), { addSuffix: true })}`
                              : "last active: —"}
                          </span>
                        )}
                    </div>
                    <div className="mt-1.5">
                      {(() => {
                        // Tappable WhatsApp chip — wa.me opens the installed
                        // WhatsApp app on mobile (chat with this trainer,
                        // pre-filled greeting) and web.whatsapp.com on desktop.
                        const link = trainer.whatsapp
                          ? whatsappLink(trainer.whatsapp, `Hi ${trainer.name}!`)
                          : null
                        if (link) {
                          return (
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open WhatsApp chat with this trainer"
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#075E54] bg-[#25D366]/10 border border-[#25D366]/30 rounded-lg px-2 py-1 max-w-full truncate hover:bg-[#25D366]/20 transition-colors touch-manipulation"
                            >
                              <WhatsAppIcon size={12} />
                              <span className="truncate">{trainer.whatsapp}</span>
                            </a>
                          )
                        }
                        return (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                            <WhatsAppIcon size={12} />
                            <span>No WhatsApp number</span>
                          </span>
                        )
                      })()}
                    </div>
                  </>
                )}
              </div>

              {/* Top-right action stack — Trash above, Pencil below. Both hidden in edit mode. */}
              {editingId !== trainer.id && (
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleDelete(trainer.id)}
                    disabled={deleting === trainer.id}
                    aria-label="Delete trainer"
                    className="p-1.5 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    onClick={() => startEdit(trainer)}
                    aria-label="Edit trainer"
                    className="p-1.5 hover:bg-[#2C6E49]/10 rounded-lg text-gray-400 hover:text-[#2C6E49] transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              )}
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
              <h2 className="text-lg font-semibold text-gray-800">{created ? "Trainer created" : "Add Trainer"}</h2>
              <button onClick={() => { setShowForm(false); setCreated(null) }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {created ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[#2C6E49]">
                  <Check size={18} />
                  <span className="text-sm font-medium">{created.name} added. Share these to sign in:</span>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Login</div>
                    <div className="text-sm font-mono text-gray-900 break-all">{created.email}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Starter password</div>
                    <div className="text-2xl font-bold font-mono tracking-[0.3em] text-[#2C6E49]">{created.password}</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  They sign in at <span className="font-mono">bookgravity.com/login</span> (or the app) and can change
                  it later. Once they do, it shows here as &laquo;changed&raquo;.
                </p>
                <button
                  onClick={() => { setShowForm(false); setCreated(null) }}
                  className="w-full bg-[#2C6E49] text-white py-3 rounded-xl text-sm font-medium hover:bg-[#1E4D34]"
                >
                  Done
                </button>
              </div>
            ) : (
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
                  <p className="text-xs text-gray-400 mt-1">A 4-digit password is generated automatically — you&apos;ll see it after creating.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp <span className="text-gray-400 font-normal">(optional)</span></label>
                  <PhoneInput
                    value={form.whatsapp}
                    onChange={(next) => setForm((f) => ({ ...f, whatsapp: next }))}
                  />
                  <p className="text-xs text-gray-400 mt-1">Used to ping the trainer about new bookings and for the WhatsApp chat link.</p>
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
            )}
          </div>
        </div>
      )}
    </div>
  )
}
