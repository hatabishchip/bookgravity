"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Plus, X, MessageCircle, CheckCircle2, AlertCircle,
  ExternalLink, Eye, EyeOff, Pencil, Building2, Users, Calendar, KeyRound, Mail, Check,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import { COUNTRIES, flagEmoji, citiesFor } from "@/lib/countries"

type StudioRow = {
  id: string
  name: string
  slug: string
  country: string | null
  city: string | null
  isDefault: boolean
  publicVisible: boolean
  logoUrl: string | null
  createdAt: string
  counts: { users: number; trainers: number; timeSlots: number; whatsappConversations: number }
  emailsSentCount: number
  admins: { email: string; role: string; initialPassword: string | null }[]
  whatsapp: {
    enabled: boolean
    phoneNumberId: string | null
    businessAccountId: string | null
    displayPhone: string | null
    connectedAt: string | null
    accessTokenPreview: string | null
    hasAccessToken: boolean
    hasConfig: boolean
    usesEnvFallback: boolean
    lastOutboundAt: string | null
    lastOutboundStatus: string | null
    templates24h: number
    onboardingEnabled: boolean
    requestStatus: string | null
    requestPhone: string | null
  }
}

export default function SuperAdminPage() {
  const [studios, setStudios] = useState<StudioRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/sadmin/studios", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStudios(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Studios</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {studios.length} studio{studios.length === 1 ? "" : "s"} • manage WhatsApp connections + create new
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700"
        >
          <Plus size={16} /> New Studio
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Studios list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : studios.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">
          No studios yet. Create your first one →
        </div>
      ) : (
        <div className="space-y-3">
          {studios.map((s) => (
            <StudioCard key={s.id} studio={s} onChanged={load} />
          ))}
        </div>
      )}

      {creating && <NewStudioModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />}
    </div>
  )
}

// WhatsApp Cloud API default messaging tier: 250 business-initiated
// conversations per rolling 24h (until Meta raises the studio's tier).
const WA_LIMIT = 250

function StudioCard({ studio, onChanged }: {
  studio: StudioRow
  onChanged: () => void
}) {
  const wa = studio.whatsapp
  // "Connected" now reflects real capability: own DB creds OR the global env
  // fallback (default studio). Fixes Canggu showing "not connected".
  const connected = wa.hasConfig
  const fullyLive = connected && wa.enabled

  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const studioAdmin = studio.admins.find((a) => a.role === "ADMIN") ?? null

  // Studio name is edited ONLY here in super-admin (regular admins can't).
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(studio.name)
  const [savingName, setSavingName] = useState(false)
  const [togglingVis, setTogglingVis] = useState(false)
  const lastOut = wa.lastOutboundAt
    ? (() => { try { return formatDistanceToNow(new Date(wa.lastOutboundAt), { addSuffix: true }) } catch { return null } })()
    : null

  const saveName = async () => {
    const next = nameVal.trim()
    if (next.length < 2 || next === studio.name) { setEditingName(false); setNameVal(studio.name); return }
    setSavingName(true)
    try {
      await fetch("/api/sadmin/studios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: studio.id, name: next }),
      })
      onChanged()
    } finally {
      setSavingName(false)
      setEditingName(false)
    }
  }

  // Eye toggle: show / hide the studio on the public chooser + switcher. The
  // booking page stays reachable at /<slug> either way.
  const toggleVisible = async () => {
    setTogglingVis(true)
    try {
      await fetch("/api/sadmin/studios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: studio.id, publicVisible: !studio.publicVisible }),
      })
      onChanged()
    } finally {
      setTogglingVis(false)
    }
  }

  const resetAdminPassword = async () => {
    if (!studioAdmin) return
    setResetting(true)
    setResetMsg(null)
    try {
      const res = await fetch("/api/sadmin/reset-admin-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId: studio.id }),
      })
      const j = await res.json().catch(() => ({}))
      setResetMsg(res.ok ? `Password reset to 0400 for ${studioAdmin.email}` : (j.error ?? "Reset failed"))
    } finally {
      setResetting(false)
      setConfirmingReset(false)
      onChanged()
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Building2 size={22} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {editingName ? (
              <>
                <input
                  autoFocus
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditingName(false); setNameVal(studio.name) } }}
                  disabled={savingName}
                  className="font-bold text-gray-900 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 min-w-0"
                />
                <button type="button" onClick={saveName} disabled={savingName} aria-label="Save name" className="p-1 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"><Check size={15} /></button>
                <button type="button" onClick={() => { setEditingName(false); setNameVal(studio.name) }} disabled={savingName} aria-label="Cancel" className="p-1 rounded text-gray-400 hover:bg-gray-100 disabled:opacity-50"><X size={15} /></button>
              </>
            ) : (
              <>
                {studio.country && (
                  <span className="text-base flex-shrink-0" title={studio.country} aria-hidden>{flagEmoji(studio.country)}</span>
                )}
                <h2 className="font-bold text-gray-900 truncate">{studio.name}</h2>
                <button type="button" onClick={() => { setNameVal(studio.name); setEditingName(true) }} aria-label="Edit studio name" className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-gray-50"><Pencil size={13} /></button>
              </>
            )}
            <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{studio.slug}</span>
            <button
              type="button"
              onClick={toggleVisible}
              disabled={togglingVis}
              aria-label={studio.publicVisible ? "Hide from public chooser" : "Show on public chooser"}
              title={
                studio.publicVisible
                  ? "Visible to clients — click to hide from the chooser (booking page still works)"
                  : "Hidden from clients — click to show on the chooser"
              }
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium disabled:opacity-50",
                studio.publicVisible
                  ? "text-emerald-600 hover:bg-emerald-50"
                  : "text-gray-400 hover:bg-gray-100",
              )}
            >
              {studio.publicVisible ? <Eye size={13} /> : <EyeOff size={13} />}
              {studio.publicVisible ? "Visible" : "Hidden"}
            </button>
          </div>
          {/* Path-based now — every studio lives at bookgravity.com/<slug>.
              The /admin link is omitted: it's one shared dashboard for all
              studios (which studio you see is decided by your login). */}
          <div className="mt-0.5">
            <a
              href={`https://bookgravity.com/${studio.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-emerald-600 inline-flex items-center gap-1"
              title="Public booking page"
            >
              bookgravity.com/{studio.slug} <ExternalLink size={10} />
            </a>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><Users size={12} />{studio.counts.users + studio.counts.trainers} people</span>
            <span className="inline-flex items-center gap-1"><Calendar size={12} />{studio.counts.timeSlots} slots</span>
            <span className="inline-flex items-center gap-1"><MessageCircle size={12} />{studio.counts.whatsappConversations} chats</span>
            <span className="inline-flex items-center gap-1"><Mail size={12} />{studio.emailsSentCount} emails sent</span>
          </div>
        </div>
      </div>

      {/* Admin logins — which account opens this studio's /admin, and a panic
          "reset to 0400" for the studio's own admin account. */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound size={14} className="text-gray-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Admin logins</span>
        </div>
        <div className="space-y-1.5">
          {studio.admins.length === 0 ? (
            <div className="text-xs text-gray-400">No admin accounts.</div>
          ) : studio.admins.map((a) => (
            <div key={a.email} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-mono text-gray-800 truncate">{a.email}</span>
                {a.role !== "SUPER_ADMIN" && (
                  <span className="ml-2 text-xs text-gray-500">
                    {a.initialPassword
                      ? <>password: <span className="font-mono font-semibold text-gray-800">{a.initialPassword}</span></>
                      : <span className="text-gray-400">•••• changed by admin</span>}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0",
                a.role === "SUPER_ADMIN" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700",
              )}>
                {a.role === "SUPER_ADMIN" ? "Super-admin" : "Admin"}
              </span>
            </div>
          ))}
        </div>

        {studioAdmin ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setConfirmingReset(true)}
              title="Reset this admin's password"
              aria-label="Reset admin password"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-emerald-700"
            >
              <KeyRound size={15} />
            </button>
            {/* One-click "open this studio's admin" — only while the admin
                still uses the starter password (so it's safe + auto-hides once
                they set their own). Opens in a new tab. */}
            {studioAdmin.initialPassword && (
              <a
                href={`/sadmin/impersonate?studio=${studio.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open this studio's admin in a new tab (signs you in as its admin)"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100"
              >
                <ExternalLink size={13} /> Open admin
              </a>
            )}
            {resetMsg && <span className="text-[11px] text-emerald-700">{resetMsg}</span>}
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-gray-400">
            Managed by the super-admin — reset that login in Settings → Change password.
          </div>
        )}
      </div>

      {confirmingReset && studioAdmin && (
        <Modal title="Reset admin password" onClose={() => setConfirmingReset(false)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                <KeyRound size={18} className="text-amber-600" />
              </div>
              <div className="text-sm text-gray-700 leading-relaxed">
                Reset the password for <span className="font-mono font-semibold text-gray-900">{studioAdmin.email}</span> to{" "}
                <span className="font-mono font-bold">0400</span>?
                <div className="text-xs text-gray-500 mt-1">
                  Their current password stops working. They can sign in with 0400 and set a new one in Settings.
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={resetAdminPassword}
                disabled={resetting}
                className="flex-1 px-3 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60"
              >
                {resetting ? "Resetting…" : "Reset to 0400"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* WhatsApp — the super-admin only opens/closes the number-entry field
          for the studio admin. The admin activates the number themselves in
          their Settings; activation flips this studio live automatically. */}
      <div className={cn(
        "mt-4 rounded-xl border p-3.5",
        fullyLive ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200",
      )}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircle size={15} className={fullyLive ? "text-emerald-700" : "text-gray-400"} />
            <span className="text-sm font-semibold text-gray-900">WhatsApp</span>
          </div>
          {/* The number-entry toggle is only for studios that haven't activated
              yet. Once WhatsApp is live there's nothing to toggle — we just show
              the connected number. */}
          {!fullyLive && (
            <button
              onClick={async () => {
                await fetch("/api/sadmin/studios", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: studio.id, whatsappOnboardingEnabled: !wa.onboardingEnabled }),
                })
                onChanged()
              }}
              title={
                wa.onboardingEnabled
                  ? "Number-entry field is open for the studio admin — click to close"
                  : "Open the number-entry field so the studio admin can activate WhatsApp"
              }
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border touch-manipulation flex-shrink-0",
                wa.onboardingEnabled
                  ? "bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100"
                  : "bg-white text-gray-500 border-gray-300 hover:bg-gray-100",
              )}
            >
              {wa.onboardingEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
              {wa.onboardingEnabled ? "Number entry ON" : "Number entry OFF"}
            </button>
          )}
        </div>

        {fullyLive ? (
          <div className="mt-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-sm">
              <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
              <span className="font-mono text-gray-900">{wa.displayPhone || "—"}</span>
              <span className="text-emerald-700 text-xs font-medium">Active</span>
            </div>
            {(() => {
              const used = wa.templates24h
              const pct = WA_LIMIT > 0 ? used / WA_LIMIT : 0
              const color = pct >= 1 ? "text-red-600" : pct >= 0.8 ? "text-amber-600" : "text-gray-600"
              return (
                <div className={cn("text-xs", color)}>
                  Messages counting toward the limit (24h):{" "}
                  <span className="font-semibold">{used} / {WA_LIMIT}</span>
                </div>
              )
            })()}
            <div className="text-[11px] text-gray-500">
              Last sent: {lastOut ? <span className="font-medium text-gray-700">{lastOut}</span> : <span className="text-gray-400">never</span>}
            </div>
          </div>
        ) : wa.requestStatus ? (
          <div className="mt-2 text-xs text-gray-600">
            Activation in progress: <span className="font-medium">{wa.requestStatus}</span>
            {wa.requestPhone && <> · <span className="font-mono">{wa.requestPhone}</span></>}
          </div>
        ) : (
          <div className="mt-2 text-xs text-gray-500">
            {wa.onboardingEnabled
              ? "The studio admin can now enter their number in Settings → WhatsApp."
              : "Turn on number entry so the studio admin can activate WhatsApp."}
          </div>
        )}
      </div>
    </div>
  )
}

// Transliterate a city (incl. Cyrillic) into a URL-safe slug, e.g.
// "Алматы" → "almaty", "Canggu" → "canggu".
const CYR_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
}
function slugifyCity(city: string): string {
  return city
    .toLowerCase()
    .split("")
    .map((ch) => CYR_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function NewStudioModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ country: "", city: "", slug: "", slugTouched: false, adminEmail: "" })
  // True once the admin picks "Other" in the city dropdown → free-text city.
  const [cityCustom, setCityCustom] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // After creation we show the auto-generated starter password once.
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)

  const cities = citiesFor(form.country)

  // City drives both the public name ("Gravity Stretching <city>") and, until
  // the slug is hand-edited, the URL slug.
  const handleCity = (city: string) => {
    setForm((f) => ({
      ...f,
      city,
      slug: f.slugTouched ? f.slug : slugifyCity(city),
    }))
  }

  // Picking a country enables + resets the city dropdown.
  const handleCountry = (country: string) => {
    setCityCustom(false)
    setForm((f) => ({ ...f, country, city: "", slug: f.slugTouched ? f.slug : "" }))
  }

  // City dropdown change: a real city, or "__other__" to type a custom one.
  const handleCitySelect = (value: string) => {
    if (value === "__other__") {
      setCityCustom(true)
      handleCity("")
    } else {
      setCityCustom(false)
      handleCity(value)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(null)
    const payload = {
      country: form.country,
      city: form.city.trim(),
      name: `Gravity Stretching ${form.city.trim()}`,
      slug: form.slug,
      adminEmail: form.adminEmail,
    }
    const res = await fetch("/api/sadmin/studios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(j.error ?? `HTTP ${res.status}`)
      setSaving(false)
      return
    }
    setCreated({ email: form.adminEmail, password: j.initialPassword })
    setSaving(false)
  }

  if (created) {
    return (
      <Modal title="Studio created" onClose={() => { onCreated() }}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 size={18} />
            <span className="text-sm font-medium">Studio is live. Share these with the owner:</span>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Login</div>
              <div className="text-sm font-mono text-gray-900 break-all">{created.email}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Starter password</div>
              <div className="text-2xl font-bold font-mono tracking-[0.3em] text-emerald-700">{created.password}</div>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            They sign in at <span className="font-mono">bookgravity.com/login</span> and change this in
            Settings. Once they do, it shows as &laquo;changed&raquo; here.
          </p>
          <button
            onClick={() => onCreated()}
            className="w-full px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
          >
            Done
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Create studio" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Country" hint="Groups the studio on the public chooser — visitors pick a country first.">
          <select
            required
            value={form.country}
            onChange={(e) => handleCountry(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <option value="" disabled>Select a country…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {flagEmoji(c.code)} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="City" hint='Pick a country first, then choose a city. The public name becomes "Gravity Stretching <city>".'>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 flex-shrink-0">Gravity Stretching</span>
            {/* City is a dropdown scoped to the chosen country, with an "Other"
                escape so a brand-new market is never blocked. Disabled until a
                country is picked. */}
            <select
              required={!cityCustom}
              disabled={!form.country}
              value={cityCustom ? "__other__" : form.city}
              onChange={(e) => handleCitySelect(e.target.value)}
              className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <option value="" disabled>
                {form.country ? "Select a city…" : "Pick a country first"}
              </option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__other__">Other (type manually)…</option>
            </select>
          </div>
          {cityCustom && (
            <input
              required
              autoFocus
              value={form.city}
              onChange={(e) => handleCity(e.target.value)}
              placeholder="City name"
              className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          )}
        </Field>
        <Field label="Slug" hint="Used in the URL — e.g. bookgravity.com/bali. lowercase, dashes only.">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 flex-shrink-0">bookgravity.com/</span>
            <input
              required
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase(), slugTouched: true })}
              placeholder="almaty"
              pattern="[a-z0-9\-]+"
              className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
        </Field>
        <Field label="Admin email" hint="The studio owner's login. A 4-digit starter password is generated automatically — you'll see it after creating.">
          <input
            required
            type="email"
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            placeholder="owner@example.com"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex-1 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
            {saving ? "Creating…" : "Create studio"}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className={cn(
        "bg-white w-full sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col overflow-hidden",
        wide ? "sm:max-w-xl" : "sm:max-w-md",
      )}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}
