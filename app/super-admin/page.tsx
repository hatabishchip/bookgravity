"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Plus, X, MessageCircle, CheckCircle2, AlertCircle,
  ExternalLink, Eye, EyeOff, Pencil, Building2, Users, Calendar,
} from "lucide-react"
import { cn } from "@/lib/utils"

type StudioRow = {
  id: string
  name: string
  slug: string
  isDefault: boolean
  logoUrl: string | null
  createdAt: string
  counts: { users: number; trainers: number; timeSlots: number; whatsappConversations: number }
  whatsapp: {
    enabled: boolean
    phoneNumberId: string | null
    businessAccountId: string | null
    displayPhone: string | null
    connectedAt: string | null
    accessTokenPreview: string | null
    hasAccessToken: boolean
  }
}

export default function SuperAdminPage() {
  const [studios, setStudios] = useState<StudioRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingWA, setEditingWA] = useState<StudioRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/super-admin/studios", { cache: "no-store" })
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
            <StudioCard key={s.id} studio={s} onConnect={() => setEditingWA(s)} onChanged={load} />
          ))}
        </div>
      )}

      {creating && <NewStudioModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />}
      {editingWA && (
        <WhatsAppConnectModal
          studio={editingWA}
          onClose={() => setEditingWA(null)}
          onSaved={() => { setEditingWA(null); load() }}
        />
      )}
    </div>
  )
}

function StudioCard({ studio, onConnect, onChanged }: {
  studio: StudioRow
  onConnect: () => void
  onChanged: () => void
}) {
  const wa = studio.whatsapp
  const connected = wa.hasAccessToken && wa.phoneNumberId
  const fullyLive = connected && wa.enabled

  const toggle = async () => {
    await fetch("/api/super-admin/studios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: studio.id, whatsappEnabled: !wa.enabled }),
    })
    onChanged()
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
          <Building2 size={22} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-gray-900 truncate">{studio.name}</h2>
            <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{studio.slug}</span>
            {studio.isDefault && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                Default
              </span>
            )}
          </div>
          {(() => {
            const host = studio.isDefault ? "bookgravity.com" : `${studio.slug}.bookgravity.com`
            return (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                <a
                  href={`https://${host}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 hover:text-emerald-600 inline-flex items-center gap-1"
                  title="Public booking page"
                >
                  {host} <ExternalLink size={10} />
                </a>
                <a
                  href={`https://${host}/admin`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 font-medium"
                  title="Open this studio's admin"
                >
                  /admin <ExternalLink size={10} />
                </a>
              </div>
            )
          })()}

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><Users size={12} />{studio.counts.users + studio.counts.trainers} people</span>
            <span className="inline-flex items-center gap-1"><Calendar size={12} />{studio.counts.timeSlots} slots</span>
            <span className="inline-flex items-center gap-1"><MessageCircle size={12} />{studio.counts.whatsappConversations} chats</span>
          </div>
        </div>
      </div>

      {/* WhatsApp connection panel */}
      <div className={cn(
        "mt-4 rounded-xl border p-3.5 flex items-center gap-3",
        fullyLive
          ? "bg-emerald-50 border-emerald-200"
          : connected
            ? "bg-amber-50 border-amber-200"
            : "bg-gray-50 border-gray-200",
      )}>
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
          fullyLive ? "bg-emerald-100" : connected ? "bg-amber-100" : "bg-gray-100",
        )}>
          {fullyLive ? (
            <CheckCircle2 size={18} className="text-emerald-700" />
          ) : connected ? (
            <AlertCircle size={18} className="text-amber-700" />
          ) : (
            <MessageCircle size={18} className="text-gray-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">
            {fullyLive ? "WhatsApp live" : connected ? "Connected but disabled" : "WhatsApp not connected"}
          </div>
          <div className="text-xs text-gray-600 mt-0.5 truncate">
            {connected
              ? <>From <span className="font-mono">{wa.displayPhone ?? "—"}</span> · Phone ID <span className="font-mono">{wa.phoneNumberId}</span></>
              : "Click Connect to wire this studio's WhatsApp Business account."}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {connected && (
            <button
              onClick={toggle}
              title={wa.enabled ? "Turn WhatsApp off for clients" : "Turn WhatsApp on for clients"}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border touch-manipulation",
                wa.enabled
                  ? "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  : "bg-white text-gray-500 border-gray-300 hover:bg-gray-100",
              )}
            >
              {wa.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
              {wa.enabled ? "Enabled" : "Disabled"}
            </button>
          )}
          <button
            onClick={onConnect}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium",
              connected
                ? "text-gray-600 hover:text-emerald-700 hover:bg-emerald-50"
                : "bg-emerald-600 text-white hover:bg-emerald-700",
            )}
          >
            {connected ? <><Pencil size={12} /> Edit</> : <><Plus size={12} /> Connect</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewStudioModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", slug: "", adminEmail: "", adminPassword: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSlugSuggest = (name: string) => {
    setForm((f) => ({
      ...f,
      name,
      slug: f.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(null)
    const res = await fetch("/api/super-admin/studios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? `HTTP ${res.status}`)
      setSaving(false)
      return
    }
    onCreated()
  }

  return (
    <Modal title="Create studio" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Studio name" hint="Public display name, e.g. Gravity Stretching Bali">
          <input
            required
            value={form.name}
            onChange={(e) => handleSlugSuggest(e.target.value)}
            placeholder="Gravity Stretching Bali"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </Field>
        <Field label="Slug" hint="Used as the subdomain — e.g. ubud.bookgravity.com. lowercase, dashes only.">
          <div className="flex items-center gap-2">
            <input
              required
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
              placeholder="bali"
              pattern="[a-z0-9\-]+"
              className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <span className="text-xs text-gray-400 flex-shrink-0">.bookgravity.com</span>
          </div>
        </Field>
        <div className="pt-2 border-t border-gray-100">
          <div className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">Initial admin account</div>
        </div>
        <Field label="Admin email">
          <input
            required
            type="email"
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            placeholder="owner@example.com"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </Field>
        <Field label="Admin password" hint="Min 8 characters. Share with studio owner securely.">
          <input
            required
            type="password"
            value={form.adminPassword}
            onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            minLength={8}
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

function WhatsAppConnectModal({ studio, onClose, onSaved }: {
  studio: StudioRow
  onClose: () => void
  onSaved: () => void
}) {
  const wa = studio.whatsapp
  const [form, setForm] = useState({
    phoneNumberId: wa.phoneNumberId ?? "",
    accessToken: "", // never prefill secret
    businessAccountId: wa.businessAccountId ?? "",
    displayPhone: wa.displayPhone ?? "",
    enableNow: wa.enabled,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hadToken = wa.hasAccessToken

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(null)
    const body: Record<string, unknown> = {
      id: studio.id,
      whatsappPhoneNumberId: form.phoneNumberId.trim() || null,
      whatsappBusinessAccountId: form.businessAccountId.trim() || null,
      whatsappDisplayPhone: form.displayPhone.trim() || null,
      whatsappEnabled: form.enableNow,
    }
    // Only send token if admin typed a new one — empty input means "keep
    // existing token" (we never reveal the old one in the form).
    if (form.accessToken.trim().length > 0) {
      body.whatsappAccessToken = form.accessToken.trim()
    }
    const res = await fetch("/api/super-admin/studios", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? `HTTP ${res.status}`)
      setSaving(false)
      return
    }
    onSaved()
  }

  const disconnect = async () => {
    if (!confirm("Disconnect WhatsApp from this studio? The inbox will go offline for clients and trainers.")) return
    setSaving(true)
    await fetch("/api/super-admin/studios", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: studio.id,
        whatsappPhoneNumberId: null,
        whatsappAccessToken: null,
        whatsappBusinessAccountId: null,
        whatsappDisplayPhone: null,
        whatsappEnabled: false,
      }),
    })
    onSaved()
  }

  return (
    <Modal title={`WhatsApp — ${studio.name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {/* Embedded Signup placeholder. The button is wired up to PATCH the
            studio with manually-pasted credentials for now; the FB SDK flow
            slots in here later (see Meta "Embedded Signup" docs). */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 leading-relaxed">
          <strong>One-click Facebook flow:</strong> coming next — will require a configured Meta App.
          For now, paste credentials manually from <a className="underline" target="_blank" rel="noopener noreferrer" href="https://business.facebook.com/wa/manage">business.facebook.com → WhatsApp Manager</a>.
        </div>

        <Field label="Phone Number ID" hint="WhatsApp Manager → API setup → Phone number ID">
          <input
            required
            value={form.phoneNumberId}
            onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
            placeholder="e.g. 123456789012345"
            className="w-full font-mono text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </Field>

        <Field
          label="System User Access Token"
          hint={hadToken ? "Leave blank to keep the existing token. Paste new to rotate." : "Permanent token with whatsapp_business_messaging + whatsapp_business_management scopes."}
        >
          <input
            type="password"
            value={form.accessToken}
            onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
            placeholder={hadToken ? `currently set: ${wa.accessTokenPreview ?? "•••••"}` : "EAAxxxxxx…"}
            className="w-full font-mono text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="WABA ID" hint="WhatsApp Business Account ID (optional, used by webhook router)">
            <input
              value={form.businessAccountId}
              onChange={(e) => setForm({ ...form, businessAccountId: e.target.value })}
              placeholder="123456789012345"
              className="w-full font-mono text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </Field>
          <Field label="Display phone" hint="Shown to admins. E.g. +62 123 …">
            <input
              value={form.displayPhone}
              onChange={(e) => setForm({ ...form, displayPhone: e.target.value })}
              placeholder="+62 …"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </Field>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.enableNow}
            onChange={(e) => setForm({ ...form, enableNow: e.target.checked })}
            className="w-4 h-4 mt-0.5 accent-emerald-600"
          />
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-800">Enable WhatsApp for this studio</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              When on, the inbox FAB shows in /admin and /trainer for this studio's users, and outbound notifications fire on bookings.
            </div>
          </div>
        </label>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>}

        <div className="flex gap-2 pt-2">
          {hadToken && (
            <button type="button" onClick={disconnect} className="px-3 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50">
              Disconnect
            </button>
          )}
          <button type="button" onClick={onClose} className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex-1 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60">
            {saving ? "Saving…" : hadToken ? "Save changes" : "Connect"}
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
