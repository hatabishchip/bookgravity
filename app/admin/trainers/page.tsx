"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Plus, Trash2, X, User, CalendarDays, Pencil, Check, Mail, CalendarPlus, CalendarCog, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { PetalSpinner } from "@/app/_components/PetalSpinner"
import TrainerSchedule from "./TrainerSchedule"
import PhoneInput from "@/app/_components/PhoneInput"
import { formatPhoneInput, validatePhone } from "@/lib/phone"
import { WhatsAppIcon } from "@/app/_components/WhatsAppIcon"
import { whatsappLink } from "@/lib/whatsapp"
import { formatDistanceToNow } from "date-fns"
import { useT, useLocale } from "@/app/_components/LocaleProvider"

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
  // "TRAINER" (default) or "STAFF". Staff are bare User rows (no schedule,
  // salary, whatsapp or commission) shown in this list with a "Staff" tag.
  kind?: "TRAINER" | "STAFF"
  name: string
  archived?: boolean
  whatsapp: string
  commissionRate: number
  color: string
  user: { email: string; initialPassword?: string | null }
  /** Latest web/mobile activity; null if the trainer never signed in. */
  lastActiveAt?: string | null
  /** Booking-notification channels for this trainer. */
  notifyEmail: boolean
  notifyWhatsapp: boolean
  /** Delegated admin rights the studio admin grants per trainer. */
  permBookAnyClass?: boolean
  permManageBookings?: boolean
  permInvertedPositions?: boolean
  /** Whether this studio has WhatsApp connected (gates the WhatsApp toggle). */
  studioWhatsAppEnabled?: boolean
}

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const t = useT()
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
        title={t("Change color")}
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
                title={t(opt.label)}
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
          <p className="text-[10px] text-gray-400 text-center">{t(COLOR_OPTIONS.find((o) => o.value === color)?.label ?? "")}</p>
        </div>
      )}
    </div>
  )
}

export default function TrainersPage() {
  const t = useT()
  const { dateLocale } = useLocale()
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{ name: string; email: string; whatsapp: string; kind: "TRAINER" | "STAFF" }>({ name: "", email: "", whatsapp: "", kind: "TRAINER" })
  // After creating, show the auto-generated 4-digit starter password once.
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)
  const [scheduleFor, setScheduleFor] = useState<Trainer | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTrainers = useCallback(async () => {
    const res = await fetch("/api/admin/trainers?all=1")
    const data = (await res.json()) as Trainer[]
    // Format raw whatsapp values from the DB so the field renders pretty
    // ("+62 821-4554-6405") instead of "+6282145546405".
    setTrainers(
      data.map((t) => ({
        ...t,
        whatsapp: t.whatsapp ? formatPhoneInput(t.whatsapp) : "",
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => { fetchTrainers() }, [fetchTrainers])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    // WhatsApp/commission only apply to trainers; staff is just name + login.
    if (form.kind === "TRAINER" && form.whatsapp.trim() !== "") {
      const v = validatePhone(form.whatsapp)
      if (v.kind !== "ok") { setError(t("WhatsApp number is incomplete or invalid")); return }
    }
    setSaving(true); setError("")
    const res = await fetch("/api/admin/trainers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || (form.kind === "STAFF" ? t("Failed to create staff") : t("Failed to create trainer"))); setSaving(false); return }
    await fetchTrainers()
    // Show the generated starter password so the admin can pass it on.
    setCreated({ name: form.name, email: form.email.trim().toLowerCase(), password: data.initialPassword })
    setForm({ name: "", email: "", whatsapp: "", kind: "TRAINER" }); setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t("Archive this trainer? They disappear from schedules and lose cabinet access, but all history (salary, past classes) is kept. You can restore them anytime."))) return
    setDeleting(id)
    await fetch(`/api/admin/trainers?id=${id}`, { method: "DELETE" })
    await fetchTrainers(); setDeleting(null)
  }

  // Reset a trainer's / staff member's login password to a fresh 4-digit PIN
  // (Sveta 07.07: a trainer added before this system had no known password and
  // no self-serve reset). Shows the new PIN once so it can be handed over.
  const [resetting, setResetting] = useState<string | null>(null)
  const [resetPin, setResetPin] = useState<Record<string, string>>({})
  const handleResetPassword = async (id: string, kind: "TRAINER" | "STAFF", label: string) => {
    if (!confirm(t('Reset the password for "{name}"? A new one is generated and shown once.', { name: label }))) return
    setResetting(id)
    const res = await fetch("/api/admin/trainers/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, kind }),
    })
    setResetting(null)
    if (!res.ok) { alert(t("Couldn't reset the password - try again.")); return }
    const data = await res.json()
    setResetPin((prev) => ({ ...prev, [id]: data.password }))
    fetchTrainers()
  }

  // Staff have no history, so removal is a real delete (not an archive).
  const handleDeleteStaff = async (id: string, label: string) => {
    if (!confirm(t('Delete staff "{name}"? This removes their login for good.', { name: label }))) return
    setDeleting(id)
    await fetch(`/api/admin/trainers?id=${id}&kind=STAFF`, { method: "DELETE" })
    await fetchTrainers(); setDeleting(null)
  }

  // Staff name lives on the User row; a quick prompt is enough for this admin tool.
  const handleRenameStaff = async (id: string, current: string | null) => {
    const name = window.prompt(t("Staff name"), current ?? "")?.trim()
    if (!name || name.length < 2) return
    await fetch(`/api/admin/trainers?id=${id}&kind=STAFF`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    await fetchTrainers()
  }

  const handleRestore = async (id: string) => {
    await fetch(`/api/admin/trainers?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    })
    await fetchTrainers()
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
  type EditDraft = { name: string; email: string; whatsapp: string; notifyEmail: boolean; notifyWhatsapp: boolean; permBookAnyClass: boolean; permManageBookings: boolean; permInvertedPositions: boolean }
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>({ name: "", email: "", whatsapp: "", notifyEmail: true, notifyWhatsapp: false, permBookAnyClass: false, permManageBookings: false, permInvertedPositions: false })
  const [editError, setEditError] = useState<string | null>(null)

  const startEdit = (t: Trainer) => {
    setEditingId(t.id)
    setDraft({
      name: t.name,
      email: t.user.email,
      whatsapp: t.whatsapp ?? "",
      notifyEmail: t.notifyEmail ?? true,
      notifyWhatsapp: t.notifyWhatsapp ?? false,
      permBookAnyClass: t.permBookAnyClass ?? false,
      permManageBookings: t.permManageBookings ?? false,
      permInvertedPositions: t.permInvertedPositions ?? false,
    })
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

    if (name.length < 2) { setEditError(t("Name - at least 2 characters")); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEditError(t("Invalid email")); return }
    if (whatsapp !== "") {
      const v = validatePhone(whatsapp)
      if (v.kind !== "ok") { setEditError(t("Invalid WhatsApp number")); return }
    }

    const body = { name, email, whatsapp, notifyEmail: draft.notifyEmail, notifyWhatsapp: draft.notifyWhatsapp, permBookAnyClass: draft.permBookAnyClass, permManageBookings: draft.permManageBookings, permInvertedPositions: draft.permInvertedPositions }
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
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">{t("Trainers")}</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand text-white px-3 lg:px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand-dark transition-colors flex-shrink-0"
        >
          <Plus size={16} /> <span className="hidden sm:inline">{t("Add Trainer")}</span><span className="sm:hidden">{t("Add")}</span>
        </button>
      </div>

      {loading && <PetalSpinner />}

      <div className={cn("grid grid-cols-1 lg:grid-cols-3 gap-4", loading && "hidden")}>
        {trainers.filter((t) => !t.archived).map((trainer) => trainer.kind === "STAFF" ? (
          // Staff card: compact (no schedule/salary/whatsapp/commission).
          <div key={trainer.id} className="rounded-2xl p-5 shadow-sm bg-white border border-gray-100 flex flex-col">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100 border-2 border-gray-200">
                <User size={20} className="text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="truncate">{trainer.name || trainer.user.email}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">{t("Staff")}</span>
                </div>
                <div className="text-sm text-gray-500 mt-0.5 truncate">{t("login:")} {trainer.user.email}</div>
                <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap">
                  {resetPin[trainer.id]
                    ? <span className="text-gray-500">{t("new password:")} <span className="font-mono font-semibold text-brand">{resetPin[trainer.id]}</span></span>
                    : trainer.user.initialPassword
                      ? <span className="text-gray-500">{t("password:")} <span className="font-mono font-semibold text-gray-700">{trainer.user.initialPassword}</span></span>
                      : <span className="text-gray-400">{trainer.lastActiveAt ? t("last active {ago}", { ago: formatDistanceToNow(new Date(trainer.lastActiveAt), { addSuffix: true, locale: dateLocale }) }) : t("hasn't signed in yet")}</span>}
                  <button
                    type="button"
                    onClick={() => handleResetPassword(trainer.id, "STAFF", trainer.name || trainer.user.email)}
                    disabled={resetting === trainer.id}
                    className="text-brand/70 hover:text-brand underline disabled:opacity-50"
                  >
                    {resetting === trainer.id ? t("resetting…") : t("reset password")}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 pt-3 mt-auto">
              <button
                onClick={() => handleRenameStaff(trainer.id, trainer.name)}
                className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg flex items-center gap-1 font-medium"
              >
                <Pencil size={12} /> {trainer.name ? t("Rename") : t("Add name")}
              </button>
              <button
                onClick={() => handleDeleteStaff(trainer.id, trainer.name || trainer.user.email)}
                disabled={deleting === trainer.id}
                className="text-xs px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-1 font-medium disabled:opacity-50"
              >
                <Trash2 size={12} /> {t("Delete")}
              </button>
            </div>
          </div>
        ) : (
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
                      <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">{t("Name")}</label>
                      <input
                        autoFocus
                        value={draft.name}
                        onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit()
                          else if (e.key === "Escape") cancelEdit()
                        }}
                        className="w-full font-semibold text-gray-900 border border-brand/30 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-brand/30"
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
                        className="w-full text-sm text-gray-700 border border-brand/30 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-brand/30"
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

                    {/* Booking-notification channels for this trainer. */}
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">{t("Notify about bookings")}</label>
                      <div className="space-y-1.5">
                        {/* Email — on by default, can be turned off */}
                        <button
                          type="button"
                          onClick={() => setDraft((p) => ({ ...p, notifyEmail: !p.notifyEmail }))}
                          className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        >
                          <span className="flex items-center gap-2 text-gray-700"><Mail size={15} /> Email</span>
                          <span className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", draft.notifyEmail ? "bg-brand" : "bg-gray-300")}>
                            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", draft.notifyEmail ? "left-[18px]" : "left-0.5")} />
                          </span>
                        </button>

                        {/* WhatsApp — only when the studio has WhatsApp connected */}
                        {trainer.studioWhatsAppEnabled ? (
                          <button
                            type="button"
                            onClick={() => setDraft((p) => ({ ...p, notifyWhatsapp: !p.notifyWhatsapp }))}
                            className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          >
                            <span className="flex items-center gap-2 text-gray-700"><WhatsAppIcon size={15} /> WhatsApp</span>
                            <span className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", draft.notifyWhatsapp ? "bg-brand" : "bg-gray-300")}>
                              <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", draft.notifyWhatsapp ? "left-[18px]" : "left-0.5")} />
                            </span>
                          </button>
                        ) : (
                          <div
                            className="w-full flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm cursor-not-allowed"
                            title={t("Connect WhatsApp for this studio to enable")}
                          >
                            <span className="flex items-center gap-2 text-gray-400 grayscale"><WhatsAppIcon size={15} /> WhatsApp</span>
                            <span className="text-[10px] text-gray-400">{t("Connect WhatsApp to enable")}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Delegated rights: the admin lets a trainer act on the
                        whole studio (Sveta 06.07.2026). Off by default. */}
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">{t("Delegated rights")}</label>
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => setDraft((p) => ({ ...p, permBookAnyClass: !p.permBookAnyClass }))}
                          className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-left"
                        >
                          <span className="flex items-center gap-2 text-gray-700"><CalendarPlus size={15} /> {t("Book into any class")}</span>
                          <span className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", draft.permBookAnyClass ? "bg-brand" : "bg-gray-300")}>
                            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", draft.permBookAnyClass ? "left-[18px]" : "left-0.5")} />
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft((p) => ({ ...p, permManageBookings: !p.permManageBookings }))}
                          className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-left"
                        >
                          <span className="flex items-center gap-2 text-gray-700"><CalendarCog size={15} /> {t("Reschedule / cancel bookings")}</span>
                          <span className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", draft.permManageBookings ? "bg-brand" : "bg-gray-300")}>
                            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", draft.permManageBookings ? "left-[18px]" : "left-0.5")} />
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft((p) => ({ ...p, permInvertedPositions: !p.permInvertedPositions }))}
                          className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-left"
                        >
                          <span className="flex items-center gap-2 text-gray-700"><ShieldCheck size={15} /> {t("Inverted positions clearance")}</span>
                          <span className={cn("relative w-9 h-5 rounded-full transition-colors flex-shrink-0", draft.permInvertedPositions ? "bg-brand" : "bg-gray-300")}>
                            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", draft.permInvertedPositions ? "left-[18px]" : "left-0.5")} />
                          </span>
                        </button>
                        <p className="text-[11px] text-gray-400 leading-snug">
                          {t("Inversion add-ons are bookable only in classes whose trainer or assistant has this clearance.")}
                        </p>
                        <p className="text-[11px] text-gray-400 leading-snug">
                          {t("The schedule itself (creating or editing classes) stays admin-only.")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={saveEdit}
                        className="text-xs px-3 py-1.5 bg-brand text-white rounded-lg hover:bg-brand-dark flex items-center gap-1 font-medium"
                      >
                        <Check size={12} /> {t("Save")}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-xs px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg flex items-center gap-1"
                      >
                        <X size={12} /> {t("Cancel")}
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
                    <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap">
                      {resetPin[trainer.id]
                        ? <span className="text-gray-500">{t("new password:")} <span className="font-mono font-semibold text-brand">{resetPin[trainer.id]}</span></span>
                        : trainer.user.initialPassword
                          ? <span className="text-gray-500">{t("password:")} <span className="font-mono font-semibold text-gray-700">{trainer.user.initialPassword}</span></span>
                          : (
                            // Password changed → don't show stars; show last login instead.
                            <span className="text-gray-400">
                              {trainer.lastActiveAt
                                ? t("last active {ago}", { ago: formatDistanceToNow(new Date(trainer.lastActiveAt), { addSuffix: true, locale: dateLocale }) })
                                : t("hasn't signed in yet")}
                            </span>
                          )}
                      <button
                        type="button"
                        onClick={() => handleResetPassword(trainer.id, "TRAINER", trainer.name)}
                        disabled={resetting === trainer.id}
                        className="text-brand/70 hover:text-brand underline disabled:opacity-50"
                      >
                        {resetting === trainer.id ? t("resetting…") : t("reset password")}
                      </button>
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
                              title={t("Open WhatsApp chat with this trainer")}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b7a4b] dark:text-[#4ade80] bg-[#25D366]/10 dark:bg-[#25D366]/15 border border-[#25D366]/40 rounded-lg px-2 py-1 max-w-full truncate hover:bg-[#25D366]/20 transition-colors touch-manipulation"
                            >
                              <WhatsAppIcon size={12} />
                              <span className="truncate">{trainer.whatsapp}</span>
                            </a>
                          )
                        }
                        return (
                          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
                            <WhatsAppIcon size={12} />
                            <span>{t("No WhatsApp number")}</span>
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
                    aria-label={t("Delete trainer")}
                    className="p-1.5 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    onClick={() => startEdit(trainer)}
                    aria-label={t("Edit trainer")}
                    className="p-1.5 hover:bg-brand/10 rounded-lg text-gray-400 hover:text-brand transition-colors"
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
                <span className="text-xs text-gray-500">{t("Schedule color")}</span>
                <ColorPicker color={trainer.color} onChange={(c) => handleColorChange(trainer.id, c)} />
              </div>
            </div>

            {/* View Schedule */}
            <button
              onClick={() => setScheduleFor(trainer)}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-white/70 hover:bg-white/90 border border-black/8 text-gray-700 dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/15 dark:text-gray-100 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              <CalendarDays size={14} />
              {t("View Schedule")}
            </button>
          </div>
        ))}

        {trainers.length === 0 && (
          <div className="col-span-1 lg:col-span-3 text-center py-12 text-gray-400 text-sm">
            {t("No trainers yet. Add your first trainer.")}
          </div>
        )}
      </div>

      {/* Archived trainers — hidden from schedules and login, history intact.
          One-click restore (delete is really an archive since 2026-06-12). */}
      {trainers.some((t) => t.archived) && !loading && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("Archived")}</h2>
          <div className="space-y-2">
            {trainers.filter((x) => x.archived).map((tr) => (
              <div key={tr.id} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 opacity-70">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-700 truncate">{tr.name}</div>
                  <div className="text-xs text-gray-400">{t("History preserved · no cabinet access")}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(tr.id)}
                  className="text-xs font-semibold text-brand hover:text-brand-dark underline whitespace-nowrap touch-manipulation"
                >
                  {t("Restore")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trainer schedule overlay */}
      {scheduleFor && (
        <TrainerSchedule trainer={scheduleFor} onClose={() => setScheduleFor(null)} />
      )}

      {/* Add trainer modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800">{created ? t("Account created") : t("Add Trainer or Staff")}</h2>
              <button onClick={() => { setShowForm(false); setCreated(null) }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {created ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-brand">
                  <Check size={18} />
                  <span className="text-sm font-medium">{t("{name} added. Share these to sign in:", { name: created.name })}</span>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{t("Login")}</div>
                    <div className="text-sm font-mono text-gray-900 break-all">{created.email}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{t("Starter password")}</div>
                    <div className="text-2xl font-bold font-mono tracking-[0.3em] text-brand">{created.password}</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  {t("They sign in at")} <span className="font-mono">bookgravity.com/login</span> {t('(or the app) and can change it later. Once they do, it shows here as "changed".')}
                </p>
                <button
                  onClick={() => { setShowForm(false); setCreated(null) }}
                  className="w-full bg-brand text-white py-3 rounded-xl text-sm font-medium hover:bg-brand-dark"
                >
                  {t("Done")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                {/* Role: trainer (default) or staff. Staff get only name + login. */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
                  {([["TRAINER", "Trainer"], ["STAFF", "Staff"]] as const).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, kind: k }))}
                      className={cn(
                        "py-2 rounded-lg text-sm font-semibold transition-colors",
                        form.kind === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("Full Name")}</label>
                  <input required type="text" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    placeholder={form.kind === "STAFF" ? t("Staff name") : t("Trainer name")}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{form.kind === "STAFF" ? t("Login") : t("Email (for login)")}</label>
                  <input required type={form.kind === "STAFF" ? "text" : "email"} value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    placeholder={form.kind === "STAFF" ? t("any login, e.g. cleaner") : "trainer@gravity.com"}
                  />
                  <p className="text-xs text-gray-400 mt-1">{t("A 4-digit password is generated automatically - you'll see it after creating.")}</p>
                </div>
                {form.kind === "TRAINER" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp <span className="text-gray-400 font-normal">({t("optional")})</span></label>
                    <PhoneInput
                      value={form.whatsapp}
                      onChange={(next) => setForm((f) => ({ ...f, whatsapp: next }))}
                    />
                    <p className="text-xs text-gray-400 mt-1">{t("Used to ping the trainer about new bookings and for the WhatsApp chat link.")}</p>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
                    {t("Cancel")}
                  </button>
                  <button type="submit" disabled={saving} className="flex-1 bg-brand text-white py-3 rounded-xl text-sm font-medium hover:bg-brand-dark disabled:opacity-60">
                    {saving ? t("Creating...") : (form.kind === "STAFF" ? t("Create Staff") : t("Create Trainer"))}
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
