"use client"

import { useState, useEffect, useRef } from "react"
import { Upload, Trash2, ImageIcon, KeyRound, Languages, Monitor, Smartphone, ShieldCheck, Pencil, X, MapPin, Sun, Moon, Mail } from "lucide-react"
import { useAdminTheme } from "@/lib/use-admin-theme"
import { formatDistanceToNow, format } from "date-fns"
import { cn } from "@/lib/utils"
import { dialCode } from "@/lib/countries"

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
  /** Maps link to the studio, included in the client's WhatsApp confirmation. */
  locationUrl: string | null
  /** Admin WhatsApp number that also receives booking alerts. */
  bookingAlertWhatsapp: string | null
  /** ISO-2 country — drives the WhatsApp phone placeholder + dial prefix. */
  country?: string | null
  /** Whether WhatsApp is connected/active for this studio. */
  whatsappEnabled?: boolean
  /** Super-admin gate for the self-service onboarding form. While false,
   *  the form is visible but disabled. */
  whatsappOnboardingEnabled?: boolean
  /** Activated WhatsApp display phone (e.g. "+62 812 345 6789"). Present
   *  once the studio finishes activation. */
  whatsappDisplayPhone?: string | null
  /** Phone-number-id from Meta (presence = activation done). */
  whatsappPhoneNumberId?: string | null
  /** In-progress onboarding state. One of: null | "code_sent" | "verifying"
   *  | "registering" | "active" | "failed". */
  whatsappRequestStatus?: string | null
  whatsappRequestDisplayPhone?: string | null
  whatsappRequestNote?: string | null
  /** Require a WhatsApp one-time code before a public booking (anti-spam).
   *  Also the "WhatsApp" channel in the Booking Confirmation section. */
  requireBookingOtp?: boolean
  /** "Email" channel in the Booking Confirmation section. */
  confirmEmail?: boolean
  /** Per-role Notifications toggles. */
  emailClientBooking?: boolean
  emailAdminBooking?: boolean
  remindTomorrow?: boolean
  remindToday?: boolean
  notifyAdminWhatsapp?: boolean
  /** Email a copy of inbound WhatsApp messages to the admin. */
  emailAdminWaCopy?: boolean
  /** True while this admin still uses the auto-generated starter password. */
  usingInitialPassword?: boolean
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
  const [saving, setSaving] = useState<"logo" | "favicon" | "cover" | "name" | "language" | "location" | "bookingAlert" | "otp" | "confirmEmail" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const loadStudio = async () => {
    const r = await fetch("/api/admin/studio", { cache: "no-store" })
    if (r.ok) setStudio(await r.json())
  }
  useEffect(() => {
    loadStudio()
  }, [])

  const update = async (
    data: Partial<Pick<Studio, "logoUrl" | "faviconUrl" | "coverUrl" | "inboxLanguage" | "locationUrl" | "bookingAlertWhatsapp" | "requireBookingOtp" | "confirmEmail" | "emailAdminWaCopy">>,
  ) => {
    const which: "logo" | "favicon" | "cover" | "language" | "location" | "bookingAlert" | "otp" | "confirmEmail" =
      "faviconUrl" in data
        ? "favicon"
        : "coverUrl" in data
          ? "cover"
          : "inboxLanguage" in data
            ? "language"
            : "locationUrl" in data
              ? "location"
              : "bookingAlertWhatsapp" in data
                ? "bookingAlert"
                : "requireBookingOtp" in data
                  ? "otp"
                  : "confirmEmail" in data
                    ? "confirmEmail"
                    : "logo"
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
          <AppearanceCard />

          <AssetCard
            title="Logo"
            description="Shown in the header of your public booking page, and used as the browser-tab icon (favicon). Best looks: PNG with transparent background, square or wide format."
            kind="logo"
            value={studio.logoUrl}
            saving={saving === "logo"}
            onPick={() => logoInputRef.current?.click()}
            onClear={() => update({ logoUrl: null })}
            previewBg="bg-white"
            previewSize="h-20"
          />

          <AssetCard
            title="Studio photo"
            description="Shown on the studio chooser at bookgravity.com and as a soft backdrop behind the booking calendar. A bright portrait photo of your studio works best (e.g. a class in session)."
            kind="cover"
            // Show the photo actually used on the chooser: the custom cover if
            // set, otherwise the bundled /studios/<slug>.jpg default — so it
            // reads as "loaded" with edit, instead of an empty uploader.
            value={studio.coverUrl ?? `/studios/${studio.slug}.jpg`}
            canRemove={!!studio.coverUrl}
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

          <LocationCard
            value={studio.locationUrl}
            saving={saving === "location"}
            onSave={(url) => update({ locationUrl: url })}
          />

          <WhatsAppActivationCard
            studio={studio}
            onChanged={loadStudio}
          />

          {/* Notifications — every message that goes out, with a preview and a
              toggle, edited behind a pencil. */}
          <NotificationsCard studio={studio} onSaved={loadStudio} />

          <SessionsCard />

          <ChangePasswordCard mustChange={!!studio.usingInitialPassword} />

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
  title, description, value, saving, onPick, onClear, previewBg, previewSize, canRemove = true,
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
  /** Hide the Remove action — e.g. when the preview is a bundled default,
   *  not a real upload (there's nothing to remove). Defaults to true. */
  canRemove?: boolean
}) {
  // Like NameCard: when an image is set we show just a pencil (edit) button;
  // the Replace/Remove actions appear only after tapping it. When nothing is
  // set yet, the Upload button is shown directly. Editing collapses back to
  // the pencil after a successful replace/remove (value changes).
  const [editing, setEditing] = useState(false)
  useEffect(() => { setEditing(false) }, [value])

  const showActions = !value || editing

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-md">{description}</p>
        </div>
        {/* Pencil — only when an image exists and we're not already editing. */}
        {value && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${title.toLowerCase()}`}
            className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-[#2C6E49] hover:bg-gray-50"
          >
            <Pencil size={16} />
          </button>
        )}
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

        {showActions && (
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
            {value && canRemove && (
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
            {value && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                aria-label="Cancel"
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AppearanceCard() {
  const { theme, setTheme } = useAdminTheme()
  const options: { value: "light" | "dark"; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ]
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Moon size={16} className="text-[#2C6E49]" />
        <h2 className="text-base font-semibold text-gray-900">Appearance</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4 max-w-md">
        Choose how the admin panel looks. Dark theme is easier on the eyes in
        low light. This preference is saved on this device.
      </p>
      <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1">
        {options.map((o) => {
          const active = theme === o.value
          const Icon = o.icon
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setTheme(o.value)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-[#2C6E49] text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900",
              )}
              aria-pressed={active}
            >
              <Icon size={16} />
              {o.label}
            </button>
          )
        })}
      </div>
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

function LocationCard({
  value,
  saving,
  onSave,
}: {
  value: string | null
  saving: boolean
  onSave: (url: string | null) => Promise<void> | void
}) {
  const [text, setText] = useState(value ?? "")
  // Empty by default → editable; once saved → collapse to a pencil.
  const [editing, setEditing] = useState(!value)
  useEffect(() => {
    setText(value ?? "")
    setEditing(!value)
  }, [value])

  const dirty = text.trim() !== (value ?? "").trim()
  const save = async () => {
    if (!dirty) { setEditing(false); return }
    await onSave(text.trim() === "" ? null : text.trim())
    // value change will collapse via the effect; collapse eagerly too.
    setEditing(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-[#2C6E49]" />
          <h2 className="text-base font-semibold text-gray-900">Studio location</h2>
        </div>
        {value && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit studio location"
            className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-[#2C6E49] hover:bg-gray-50"
          >
            <Pencil size={16} />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4 max-w-md">
        Paste a Google Maps link to your studio. It&apos;s added to the
        client&apos;s WhatsApp booking confirmation so they can navigate
        straight to you. Leave empty to omit it.
      </p>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="url"
            inputMode="url"
            autoFocus={!!value}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save() }}
            placeholder="https://maps.app.goo.gl/…"
            className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49]"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-shrink-0 bg-[#2C6E49] hover:bg-[#1E4D34] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => { setText(value); setEditing(false) }}
              disabled={saving}
              aria-label="Cancel"
              className="flex-shrink-0 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <a href={value ?? "#"} target="_blank" rel="noreferrer" className="text-sm text-[#2C6E49] underline underline-offset-2 break-all">
          {value} ↗
        </a>
      )}
    </div>
  )
}

// Toggle: require a WhatsApp one-time code before a public booking (anti-spam).
// A single labelled toggle row.
function ToggleRow({
  label,
  desc,
  value,
  saving,
  onToggle,
  preview,
}: {
  label: string
  desc: string
  value: boolean
  saving: boolean
  onToggle: (on: boolean) => Promise<void> | void
  /** Preview of the message this toggle controls — shown even when OFF so the
   *  admin sees exactly what they're enabling. */
  preview?: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">
            {label} {saving && <span className="text-[11px] text-[#2C6E49] font-normal">Saving…</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          disabled={saving}
          onClick={() => onToggle(!value)}
          className={cn(
            "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
            value ? "bg-[#2C6E49]" : "bg-gray-300",
          )}
          aria-label={`Toggle ${label}`}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              value ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
      {preview != null && (
        <div
          className={cn(
            "mt-2 rounded-xl border bg-gray-50 px-3 py-2 text-[11px] whitespace-pre-wrap leading-relaxed transition-opacity",
            value ? "border-gray-200 text-gray-600" : "border-gray-100 text-gray-400 opacity-70",
          )}
        >
          {preview}
        </div>
      )}
    </div>
  )
}

// Notifications — the home for every outbound message, grouped by WhatsApp +
// Email, each with a live preview and a toggle. Editing opens a modal (pencil)
// where the admin flips toggles and hits Save.
// WhatsApp brand glyph — green when the channel is active, grey when off.
const WA_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"

function WaIcon({ active, size = 20 }: { active: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="WhatsApp">
      <path fill={active ? "#25D366" : "#CBD5E1"} d={WA_PATH} />
    </svg>
  )
}

// Channel icons for a role row: WhatsApp + Email, coloured when active, dim grey
// when that channel sends nothing.
function ChannelIcons({ wa, email }: { wa: boolean; email: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-hidden>
      <WaIcon active={wa} />
      <Mail size={19} className={email ? "text-[#2C6E49]" : "text-gray-300"} />
    </span>
  )
}

function NotifRoleRow({
  label,
  wa,
  email,
  onEdit,
}: {
  label: string
  wa: boolean
  email: boolean
  onEdit: () => void
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-semibold text-gray-400 w-14 flex-shrink-0">{label}</span>
        <ChannelIcons wa={wa} email={email} />
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label} notifications`}
        className="p-2 rounded-lg text-gray-400 hover:text-[#2C6E49] hover:bg-gray-50 flex-shrink-0"
      >
        <Pencil size={16} />
      </button>
    </div>
  )
}

// A big, readable toggle row used inside the full-screen modal.
function BigRow({
  label,
  desc,
  value,
  onToggle,
  preview,
}: {
  label: string
  desc: string
  value: boolean
  onToggle: (on: boolean) => void
  preview: string
}) {
  return (
    <div className="border border-gray-200 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-base font-semibold text-gray-900">{label}</div>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">{desc}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          onClick={() => onToggle(!value)}
          className={cn(
            "relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors",
            value ? "bg-[#2C6E49]" : "bg-gray-300",
          )}
          aria-label={`Toggle ${label}`}
        >
          <span className={cn("inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform", value ? "translate-x-[22px]" : "translate-x-0.5")} />
        </button>
      </div>
      <div className={cn(
        "mt-3 rounded-xl border bg-gray-50 px-4 py-3 text-[15px] whitespace-pre-wrap leading-relaxed",
        value ? "border-gray-200 text-gray-700" : "border-gray-100 text-gray-400",
      )}>
        {preview}
      </div>
    </div>
  )
}

function NotificationsCard({
  studio,
  onSaved,
}: {
  studio: Studio
  onSaved: () => Promise<void> | void
}) {
  const [open, setOpen] = useState<null | "client" | "admin">(null)
  const waOn = !!studio.whatsappEnabled
  // Which channels actually send something for each role.
  const clientWa = waOn && (studio.requireBookingOtp !== false || studio.remindTomorrow !== false || studio.remindToday !== false)
  const clientEmail = studio.emailClientBooking !== false
  const adminWa = waOn && studio.notifyAdminWhatsapp !== false && !!studio.bookingAlertWhatsapp
  const adminEmail = studio.emailAdminBooking !== false || studio.emailAdminWaCopy !== false
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
        Who gets what, by WhatsApp and email. A bright icon = that channel is on. Tap the pencil to see every message and change it.
      </p>
      <div className="mt-2 divide-y divide-gray-100">
        <NotifRoleRow label="Client" wa={clientWa} email={clientEmail} onEdit={() => setOpen("client")} />
        <NotifRoleRow label="Admin" wa={adminWa} email={adminEmail} onEdit={() => setOpen("admin")} />
      </div>
      {open && (
        <NotificationsModal
          role={open}
          studio={studio}
          onClose={() => setOpen(null)}
          onSaved={() => { setOpen(null); onSaved() }}
        />
      )}
    </div>
  )
}

// Full-screen, per-role notifications editor. Lists every message that role
// receives, grouped by WhatsApp + Email, each with a toggle and a large
// preview. Saves all toggles at once.
function NotificationsModal({
  role,
  studio,
  onClose,
  onSaved,
}: {
  role: "client" | "admin"
  studio: Studio
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const waOn = !!studio.whatsappEnabled
  const [d, setD] = useState({
    requireBookingOtp: studio.requireBookingOtp !== false,
    remindTomorrow: studio.remindTomorrow !== false,
    remindToday: studio.remindToday !== false,
    emailClientBooking: studio.emailClientBooking !== false,
    notifyAdminWhatsapp: studio.notifyAdminWhatsapp !== false,
    emailAdminBooking: studio.emailAdminBooking !== false,
    emailAdminWaCopy: studio.emailAdminWaCopy !== false,
  })
  const set = (k: keyof typeof d) => (on: boolean) => setD((p) => ({ ...p, [k]: on }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const studioName = studio.name ?? "your studio"

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      const res = await fetch("/api/admin/studio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      })
      if (!res.ok) { setErr(`Couldn't save (HTTP ${res.status})`); setSaving(false); return }
      await onSaved()
    } catch {
      setErr("Couldn't save — try again.")
      setSaving(false)
    }
  }

  const recip = role === "client" ? "client" : "you"
  // Each channel is its own card with a bold coloured header (green for
  // WhatsApp, blue for Email) so it's obvious which channel a row belongs to.
  const ChannelGroup = ({ channel, children }: { channel: "whatsapp" | "email"; children: React.ReactNode }) => {
    const wa = channel === "whatsapp"
    return (
      <section className={cn("rounded-2xl border-2 overflow-hidden", wa ? "border-[#25D366]/40" : "border-blue-200")}>
        <div className={cn("flex items-center gap-2.5 px-4 py-3", wa ? "bg-[#25D366]/12" : "bg-blue-50")}>
          {wa ? <WaIcon active size={22} /> : <Mail size={20} className="text-blue-600" />}
          <span className={cn("text-base font-bold", wa ? "text-[#0F7A3D]" : "text-blue-700")}>
            {wa ? "WhatsApp" : "Email"}
          </span>
          <span className="text-sm text-gray-400">→ {recip}</span>
        </div>
        <div className="p-4 space-y-4 bg-white">{children}</div>
      </section>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <h3 className="text-lg font-bold text-gray-900">
          {role === "client" ? "Client" : "Admin"} notifications
        </h3>
        <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
          <X size={22} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 max-w-2xl mx-auto w-full space-y-8">
        {role === "client" ? (
          <>
            {waOn && (
              <ChannelGroup channel="whatsapp">
                <BigRow
                  label="Booking confirmation"
                  desc="Sent to the client on WhatsApp right after booking, with a 2-digit code to confirm (stops spam)."
                  value={d.requireBookingOtp}
                  onToggle={set("requireBookingOtp")}
                  preview={"You're booked 💖\n\nJune 9 (Tuesday)\n7:00 AM class\nTicket: #352\n\n📍 Location:\nmaps.app.goo.gl/…\n\n[ Cancel booking ]"}
                />
                <BigRow
                  label="Reminder — the day before"
                  desc="Sent the afternoon before the class."
                  value={d.remindTomorrow}
                  onToggle={set("remindTomorrow")}
                  preview={"Reminder: your group class is tomorrow at 7:00–8:30. Please arrive 10 minutes early."}
                />
                <BigRow
                  label="Same-day check-in"
                  desc="Sent ~2.5 hours before the class — the client's reply is forwarded to the trainer."
                  value={d.remindToday}
                  onToggle={set("remindToday")}
                  preview={"Hello! 🌿 Just a gentle reminder about your class today — are you still able to join us? We'd love to see you on the mat. 🙏"}
                />
              </ChannelGroup>
            )}
            <ChannelGroup channel="email">
              <BigRow
                label="Booking confirmation"
                desc={waOn
                  ? "Only used when WhatsApp can't reach the client (otherwise they get the WhatsApp confirmation)."
                  : "Emailed to the client right after booking."}
                value={d.emailClientBooking}
                onToggle={set("emailClientBooking")}
                preview={`Subject: Booking confirmed · ${studioName} · Jun 9, 7:00\n\nName, date, time, class and ticket — the full booking details.\nFrom: ${studioName}`}
              />
            </ChannelGroup>
          </>
        ) : (
          <>
            {waOn && (
              <ChannelGroup channel="whatsapp">
                <BigRow
                  label="New booking alert"
                  desc={studio.bookingAlertWhatsapp
                    ? `Sent to your alert number (${studio.bookingAlertWhatsapp}) when a client books.`
                    : "Set your alert WhatsApp number in the 'Booking alerts' field to receive these."}
                  value={d.notifyAdminWhatsapp}
                  onToggle={set("notifyAdminWhatsapp")}
                  preview={"New booking 🎉\nGroup class · June 9, 7:00–8:30\nClient: Ni Putu\n3/8 booked"}
                />
              </ChannelGroup>
            )}
            <ChannelGroup channel="email">
              <BigRow
                label="Booking confirmation copy"
                desc="A copy of every booking, emailed to you with the full client + class info."
                value={d.emailAdminBooking}
                onToggle={set("emailAdminBooking")}
                preview={`Subject: Booking confirmed · ${studioName} · Jun 9, 7:00\n\nClient name, phone, email, date, time, class and ticket.\nFrom: ${studioName}`}
              />
              {waOn && (
                <BigRow
                  label="WhatsApp message copy"
                  desc="Every WhatsApp message a client sends is also emailed to you, so you never miss one."
                  value={d.emailAdminWaCopy}
                  onToggle={set("emailAdminWaCopy")}
                  preview={"📨 WhatsApp message from a client\n\n“Hi, can I move my class to tomorrow?”\nForwarded to your email."}
                />
              )}
            </ChannelGroup>
          </>
        )}

        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>

      {/* Footer */}
      <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0 max-w-2xl mx-auto w-full">
        <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-base font-medium hover:bg-gray-50">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving} className="flex-1 px-4 py-3 rounded-xl bg-[#2C6E49] text-white text-base font-semibold hover:bg-[#1E4D34] disabled:opacity-60">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  )
}

// WhatsApp self-onboarding card. State machine over the studio row:
//
//   1. !onboardingEnabled                       → "Locked" (visible but inert)
//   2. enabled + no request + not connected     → "Idle" (input phone + name)
//   3. requestStatus === "code_sent"            → "Code" (input 6 digits)
//   4. requestStatus === "verifying"            → "Spinner"
//   5. whatsappEnabled + phoneNumberId          → "Active" (green check)
//   6. requestStatus === "failed"               → "Error" (with retry)
//
// The same component handles every state so the admin sees a continuous
// flow: enter phone → enter code → green checkmark. No PDF, no Facebook.
function WhatsAppActivationCard({
  studio,
  onChanged,
}: {
  studio: Studio
  onChanged: () => Promise<void> | void
}) {
  const onboardingEnabled = !!studio.whatsappOnboardingEnabled
  const active =
    !!studio.whatsappEnabled && !!studio.whatsappPhoneNumberId
  const status = studio.whatsappRequestStatus ?? null
  // Country-aware phone example: the studio's dial code, then zeros. The admin
  // types only digits — we keep a leading "+" so they never type it.
  const dial = dialCode(studio.country)
  const phonePlaceholder = dial ? `+${dial} 000 000 0000` : "+000 000 0000"

  const [phone, setPhone] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setLocalError(null)
    try {
      const r = await fetch("/api/admin/whatsapp-onboarding/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          displayName: displayName.trim(),
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) {
        setLocalError(j.error ?? `HTTP ${r.status}`)
      } else {
        await onChanged()
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    setLocalError(null)
    try {
      const r = await fetch("/api/admin/whatsapp-onboarding/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      })
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) {
        setLocalError(j.error ?? `HTTP ${r.status}`)
      } else {
        setCode("")
        await onChanged()
      }
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    setBusy(true)
    try {
      await fetch("/api/admin/whatsapp-onboarding/cancel", { method: "POST" })
      setPhone("")
      setCode("")
      setLocalError(null)
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  // ----- Render -----
  const Header = (
    <div className="flex items-center gap-2 mb-3">
      <Smartphone size={16} className="text-[#2C6E49]" />
      <h2 className="text-base font-semibold text-gray-900">WhatsApp</h2>
      {active && (
        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
          Active
        </span>
      )}
    </div>
  )

  // Active = connected, shown with the connected phone (no badge circle).
  if (active) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5">
        {Header}
        <p className="text-xs text-gray-500 mb-3 max-w-md">
          WhatsApp is connected for this studio. Clients receive confirmations,
          bookings are copied to this number, and the inbox is live.
        </p>
        <div className="font-mono text-sm text-gray-900">
          {studio.whatsappDisplayPhone || studio.whatsappRequestDisplayPhone || "—"}
        </div>
      </div>
    )
  }

  // Code input phase — admin received SMS, ready to verify.
  if (status === "code_sent" || status === "verifying") {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5">
        {Header}
        <p className="text-xs text-gray-500 mb-4 max-w-md">
          Enter the 6 digits from the SMS Meta sent to{" "}
          <span className="font-mono">{studio.whatsappRequestDisplayPhone}</span>.
        </p>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) verify() }}
            placeholder="123456"
            disabled={busy || status === "verifying"}
            className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-2.5 text-lg font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={verify}
            disabled={busy || code.length !== 6}
            className="flex-shrink-0 bg-[#2C6E49] hover:bg-[#1E4D34] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl inline-flex items-center gap-2"
          >
            {busy && <Spinner />}
            Confirm
          </button>
        </div>
        {localError && (
          <p className="text-xs text-red-600 mb-2">{localError}</p>
        )}
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
        >
          Cancel and enter a different number
        </button>
      </div>
    )
  }

  // Locked — super-admin hasn't enabled self-onboarding yet.
  if (!onboardingEnabled) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 opacity-75">
        {Header}
        <p className="text-xs text-gray-500 mb-4 max-w-md">
          WhatsApp activation isn&apos;t open for this studio yet. Contact the
          platform admin to enable it.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="tel"
            disabled
            placeholder={phonePlaceholder}
            className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
          />
          <button
            type="button"
            disabled
            className="flex-shrink-0 bg-gray-200 text-gray-400 text-sm font-semibold px-4 py-2.5 rounded-xl cursor-not-allowed"
          >
            Activate
          </button>
        </div>
      </div>
    )
  }

  // Idle — admin can submit a new phone.
  const failed = status === "failed"
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      {Header}
      <p className="text-xs text-gray-500 mb-4 max-w-md">
        Enter the number WhatsApp will run on for this studio. An SMS code
        arrives on that number in ~30 seconds.
      </p>
      <div className="space-y-2 mb-3">
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          // Admin types digits only — we keep the leading "+" automatically.
          onChange={(e) => setPhone("+" + e.target.value.replace(/\D/g, ""))}
          placeholder={phonePlaceholder}
          disabled={busy}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] disabled:opacity-60"
        />
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={`WhatsApp display name — e.g. ${studio.name}`}
          disabled={busy}
          maxLength={64}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2C6E49]/30 focus:border-[#2C6E49] disabled:opacity-60"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !phone.trim() || !displayName.trim()}
          className="bg-[#2C6E49] hover:bg-[#1E4D34] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl inline-flex items-center gap-2"
        >
          {busy && <Spinner />}
          Activate
        </button>
        {failed && (
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
          >
            Reset
          </button>
        )}
      </div>
      {(localError || (failed && studio.whatsappRequestNote)) && (
        <p className="text-xs text-red-600 mt-3">
          {localError ?? studio.whatsappRequestNote}
        </p>
      )}
      <p className="text-[11px] text-gray-400 mt-3">
        The number must be new (not registered in WhatsApp on a phone). If the
        SIM is already in use, delete its WhatsApp account on the phone first.
      </p>
    </div>
  )
}

// Tiny inline spinner. Reused across busy states in this component.
function Spinner() {
  return (
    <svg
      className="animate-spin w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
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
  const seenAbs = (iso: string) => {
    try { return format(new Date(iso), "d MMM yyyy, HH:mm") } catch { return "" }
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
            {kind === "web" ? "Browser" : "Mobile app"} · last login {seen(s.lastSeenAt)}
          </div>
          <div className="text-[10px] text-gray-300">{seenAbs(s.lastSeenAt)}</div>
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

function ChangePasswordCard({ mustChange }: { mustChange: boolean }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  // Expanded by default while still on the starter password; otherwise show a
  // pencil and only reveal the form when the admin taps it.
  const [editing, setEditing] = useState(mustChange)
  useEffect(() => { if (mustChange) setEditing(true) }, [mustChange])

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
      setEditing(false) // collapse to the pencil now that they have their own
      setTimeout(() => setDone(false), 3000)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? "Error")
    }
    setLoading(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <KeyRound size={16} className="text-[#2C6E49]" />
          <h2 className="text-base font-semibold text-gray-900">Change password</h2>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Change password"
            className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-[#2C6E49] hover:bg-gray-50"
          >
            <Pencil size={16} />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        {mustChange
          ? "You're still using the starter password — set your own to secure the account."
          : "Update the password used to sign into this admin account."}
      </p>

      {done && !editing && <p className="text-xs text-[#2C6E49] font-medium">Password updated ✓</p>}

      {!editing ? null : (
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
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#2C6E49] text-white text-sm font-medium hover:bg-[#1E4D34] disabled:opacity-60"
          >
            {loading ? "Saving…" : "Update password"}
          </button>
          {!mustChange && (
            <button
              type="button"
              onClick={() => { setEditing(false); setError(""); setForm({ current: "", next: "", confirm: "" }) }}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      )}
    </div>
  )
}
