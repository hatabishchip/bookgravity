"use client"

import { useState, useEffect, useRef } from "react"
import { Upload, Trash2, ImageIcon, KeyRound, Languages, Monitor, Smartphone, ShieldCheck } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

type Studio = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  faviconUrl: string | null
  /** Cover photo shown on the studio chooser + booking calendar backdrop. */
  coverUrl: string | null
  isDefault: boolean
  /** ISO 639-1 code that admin-facing inbox text is shown in, or null = off. */
  inboxLanguage: string | null
}

// Must mirror SUPPORTED_INBOX_LANGS in /api/admin/studio/route.ts. We keep
// the labels client-side so we don't need a separate endpoint just for
// a 7-row constant table.
const LANG_OPTIONS: { value: string | null; label: string; emoji: string }[] = [
  { value: null, label: "Off (show originals)", emoji: "🚫" },
  { value: "ru", label: "Russian (Русский)", emoji: "🇷🇺" },
  { value: "en", label: "English", emoji: "🇬🇧" },
  { value: "id", label: "Indonesian (Bahasa)", emoji: "🇮🇩" },
  { value: "es", label: "Spanish (Español)", emoji: "🇪🇸" },
  { value: "it", label: "Italian (Italiano)", emoji: "🇮🇹" },
  { value: "fr", label: "French (Français)", emoji: "🇫🇷" },
  { value: "de", label: "German (Deutsch)", emoji: "🇩🇪" },
]

// Read a File as a data URL (base64-encoded), optionally downscaling images
// so we keep payloads small.
function readImageAsDataUrl(file: File, maxDim = 512, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const dataUrl = String(reader.result)
      // For SVG / non-image — just return raw data URL
      if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
        resolve(dataUrl)
        return
      }
      const img = new Image()
      img.onload = () => {
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) return resolve(dataUrl)
        ctx.drawImage(img, 0, 0, w, h)
        // PNG keeps transparency; everything else as JPEG for smaller size
        const out = file.type === "image/png"
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", quality)
        resolve(out)
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

export default function SettingsPage() {
  const [studio, setStudio] = useState<Studio | null>(null)
  const [saving, setSaving] = useState<"logo" | "favicon" | "cover" | "name" | "language" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/admin/studio").then((r) => r.json()).then(setStudio)
  }, [])

  const update = async (
    data: Partial<Pick<Studio, "logoUrl" | "faviconUrl" | "coverUrl" | "name" | "inboxLanguage">>,
  ) => {
    const which: "logo" | "favicon" | "cover" | "name" | "language" =
      "logoUrl" in data
        ? "logo"
        : "faviconUrl" in data
          ? "favicon"
          : "coverUrl" in data
            ? "cover"
            : "inboxLanguage" in data
              ? "language"
              : "name"
    setSaving(which)
    setError(null)
    const res = await fetch("/api/admin/studio", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      setStudio(updated)
    } else {
      const e = await res.json().catch(() => ({}))
      setError(e.error ?? "Failed to save")
    }
    setSaving(null)
  }

  const handleFile = async (kind: "logo" | "favicon" | "cover", file: File) => {
    if (!file) return
    // Covers are full-bleed photos, so allow a larger source file.
    const maxBytes = kind === "cover" ? 6 * 1024 * 1024 : 2 * 1024 * 1024
    if (file.size > maxBytes) {
      setError(`Image is too large (max ${maxBytes / (1024 * 1024)} MB).`)
      return
    }
    try {
      const maxDim = kind === "favicon" ? 64 : kind === "cover" ? 1000 : 512
      const quality = kind === "cover" ? 0.8 : 0.85
      const dataUrl = await readImageAsDataUrl(file, maxDim, quality)
      await update(
        kind === "logo"
          ? { logoUrl: dataUrl }
          : kind === "favicon"
            ? { faviconUrl: dataUrl }
            : { coverUrl: dataUrl },
      )
    } catch {
      setError("Could not read the file.")
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl lg:text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-gray-500 text-xs lg:text-sm mb-6">
        Branding for {studio?.name ?? "your studio"} — customers see this on the booking page.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {!studio ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="space-y-4">
          <NameCard
            initialName={studio.name}
            saving={saving === "name"}
            onSave={(name) => update({ name })}
          />

          <AssetCard
            title="Logo"
            description="Shown in the header of your public booking page. Best looks: PNG with transparent background, square or wide format."
            kind="logo"
            value={studio.logoUrl}
            saving={saving === "logo"}
            onPick={() => logoInputRef.current?.click()}
            onClear={() => update({ logoUrl: null })}
            previewBg="bg-white"
            previewSize="h-20"
          />

          <AssetCard
            title="Favicon"
            description="Browser tab icon. Square image works best (32×32 or 64×64)."
            kind="favicon"
            value={studio.faviconUrl}
            saving={saving === "favicon"}
            onPick={() => faviconInputRef.current?.click()}
            onClear={() => update({ faviconUrl: null })}
            previewBg="bg-gray-100"
            previewSize="h-10 w-10"
          />

          <AssetCard
            title="Studio photo"
            description="Shown on the studio chooser at bookgravity.com and as a soft backdrop behind the booking calendar. A bright portrait photo of your studio works best (e.g. a class in session)."
            kind="cover"
            value={studio.coverUrl}
            saving={saving === "cover"}
            onPick={() => coverInputRef.current?.click()}
            onClear={() => update({ coverUrl: null })}
            previewBg="bg-gray-100"
            previewSize="h-20 w-16"
          />

          <InboxLanguageCard
            value={studio.inboxLanguage}
            saving={saving === "language"}
            onSave={(lang) => update({ inboxLanguage: lang })}
          />

          <SessionsCard />

          <ChangePasswordCard />

          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile("logo", f)
              e.target.value = ""
            }}
          />
          <input
            ref={faviconInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile("favicon", f)
              e.target.value = ""
            }}
          />
          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile("cover", f)
              e.target.value = ""
            }}
          />
        </div>
      )}
    </div>
  )
}

function AssetCard({
  title, description, value, saving, onPick, onClear, previewBg, previewSize,
}: {
  title: string
  description: string
  kind: "logo" | "favicon" | "cover"
  value: string | null
  saving: boolean
  onPick: () => void
  onClear: () => void
  previewBg: string
  previewSize: string
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-md">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className={cn("rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden", previewBg, previewSize, value ? "" : "min-w-[80px]")}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={title} className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageIcon size={20} className="text-gray-300" />
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <button
            type="button"
            onClick={onPick}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2C6E49] text-white text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60"
          >
            <Upload size={14} />
            {saving ? "Saving…" : value ? `Replace ${title.toLowerCase()}` : `Upload ${title.toLowerCase()}`}
          </button>
          {value && (
            <button
              type="button"
              onClick={onClear}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
            >
              <Trash2 size={14} />
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function NameCard({
  initialName, saving, onSave,
}: {
  initialName: string
  saving: boolean
  onSave: (name: string) => Promise<void> | void
}) {
  const [value, setValue] = useState(initialName)
  const [done, setDone] = useState(false)

  useEffect(() => { setValue(initialName) }, [initialName])

  const dirty = value.trim() !== initialName.trim() && value.trim().length >= 2

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dirty || saving) return
    await onSave(value.trim())
    setDone(true)
    setTimeout(() => setDone(false), 2000)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <h2 className="text-base font-semibold text-gray-900">Studio name</h2>
      <p className="text-xs text-gray-500 mt-1 mb-4 max-w-md">
        Shown in the header of your public booking page and on the ticket. For example, &laquo;Gravity Stretching Canggu&raquo; or &laquo;Gravity Stretching Ubud&raquo;.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          minLength={2}
          maxLength={100}
          required
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
          placeholder="e.g. Gravity Stretching Canggu"
        />
        <button
          type="submit"
          disabled={!dirty || saving}
          className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-[#2C6E49] text-white text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60"
        >
          {saving ? "Saving…" : done ? "Saved ✓" : "Save"}
        </button>
      </form>
    </div>
  )
}

function InboxLanguageCard({
  value,
  saving,
  onSave,
}: {
  value: string | null
  saving: boolean
  onSave: (lang: string | null) => Promise<void> | void
}) {
  // Localish change UX: pick from a small native <select>, save immediately
  // on change. No need for a separate "Save" button — it's a single
  // dropdown and the round-trip is fast.
  const [done, setDone] = useState(false)
  const handle = async (next: string | null) => {
    await onSave(next)
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Languages size={16} className="text-[#2C6E49]" />
        <h2 className="text-base font-semibold text-gray-900">Inbox language</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4 max-w-md">
        Auto-translate incoming WhatsApp messages so the inbox always reads
        in your language. Your replies are also translated back into the
        client&apos;s detected language before delivery — clients see them
        in whatever language they wrote in. The original text is always
        preserved underneath the translation.
      </p>
      <div className="flex items-center gap-3">
        <select
          value={value ?? ""}
          onChange={(e) => handle(e.target.value === "" ? null : e.target.value)}
          disabled={saving}
          className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] disabled:opacity-60 min-w-[260px]"
        >
          {LANG_OPTIONS.map((o) => (
            <option key={o.value ?? "off"} value={o.value ?? ""}>
              {o.emoji} {o.label}
            </option>
          ))}
        </select>
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {done && !saving && (
          <span className="text-xs text-[#2C6E49] font-medium">Saved ✓</span>
        )}
      </div>
    </div>
  )
}

type SignIn = { id: string; device: string; lastSeenAt: string; platform?: string }
type UserSessions = {
  userId: string
  email: string
  role: string
  name: string | null
  web: SignIn[]
  mobile: SignIn[]
}

function roleLabel(role: string): string {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "Admin"
  if (role === "TRAINER") return "Trainer"
  return role
}

function SessionsCard() {
  const [data, setData] = useState<UserSessions[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch("/api/admin/sessions", { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to load")
      setData(await res.json())
    } catch {
      setError("Could not load sign-ins.")
    }
  }
  useEffect(() => { load() }, [])

  const remove = async (kind: "web" | "mobile", id: string) => {
    setBusy(id)
    try {
      await fetch(`/api/admin/sessions?kind=${kind}&id=${encodeURIComponent(id)}`, { method: "DELETE" })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const seen = (iso: string) => {
    try { return formatDistanceToNow(new Date(iso), { addSuffix: true }) } catch { return "" }
  }

  const Row = ({ kind, s }: { kind: "web" | "mobile"; s: SignIn }) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2.5 min-w-0">
        {kind === "web"
          ? <Monitor size={16} className="text-gray-400 flex-shrink-0" />
          : <Smartphone size={16} className="text-gray-400 flex-shrink-0" />}
        <div className="min-w-0">
          <div className="text-sm text-gray-800 truncate">{s.device}</div>
          <div className="text-[11px] text-gray-400">
            {kind === "web" ? "Browser" : "Mobile app"} · active {seen(s.lastSeenAt)}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => remove(kind, s.id)}
        disabled={busy === s.id}
        className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50 flex-shrink-0"
      >
        {busy === s.id ? "…" : "Remove"}
      </button>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={16} className="text-[#2C6E49]" />
        <h2 className="text-base font-semibold text-gray-900">Active sign-ins</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4 max-w-md">
        Everyone currently signed in to your studio — admins and trainers — and
        the devices they&apos;re on. Remove anything that shouldn&apos;t be
        there. Mobile removals also stop that device&apos;s notifications.
      </p>

      {error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : !data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400">No accounts yet.</p>
      ) : (
        <div className="space-y-4">
          {data.map((u) => {
            const total = u.web.length + u.mobile.length
            return (
              <div key={u.userId} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-gray-900">{u.name ?? u.email}</span>
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[#2C6E49] bg-[#2C6E49]/10 px-1.5 py-0.5 rounded">
                      {roleLabel(u.role)}
                    </span>
                  </div>
                </div>
                {total === 0 ? (
                  <p className="text-[11px] text-gray-400">Not signed in on any device.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {u.web.map((s) => <Row key={s.id} kind="web" s={s} />)}
                    {u.mobile.map((s) => <Row key={s.id} kind="mobile" s={s} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ChangePasswordCard() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (form.next.length < 4) { setError("Password must be at least 4 characters"); return }
    if (form.next !== form.confirm) { setError("Passwords do not match"); return }
    setLoading(true)
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
    })
    if (res.ok) {
      setDone(true)
      setForm({ current: "", next: "", confirm: "" })
      setTimeout(() => setDone(false), 3000)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? "Error")
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <KeyRound size={16} className="text-[#2C6E49]" />
        <h2 className="text-base font-semibold text-gray-900">Change password</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">Update the password used to sign into this admin account.</p>

      <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
        <input
          type="password"
          required
          placeholder="Current password"
          value={form.current}
          onChange={(e) => setForm({ ...form, current: e.target.value })}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="password"
            required
            placeholder="New password"
            minLength={4}
            value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
          />
          <input
            type="password"
            required
            placeholder="Confirm new password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {done && <p className="text-xs text-[#2C6E49] font-medium">Password updated.</p>}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2C6E49] text-white text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60"
        >
          {loading ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  )
}
