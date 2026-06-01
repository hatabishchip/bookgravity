"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Plus, X, MessageCircle, CheckCircle2, AlertCircle,
  ExternalLink, Eye, EyeOff, Pencil, Building2, Users, Calendar, KeyRound, Mail, Check,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"

type StudioRow = {
  id: string
  name: string
  slug: string
  isDefault: boolean
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
  }
}

type HealthResult =
  | { ok: true; displayPhone?: string; verifiedName?: string; qualityRating?: string }
  | { ok: false; error: string }

export default function SuperAdminPage() {
  const [studios, setStudios] = useState<StudioRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingWA, setEditingWA] = useState<StudioRow | null>(null)
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
  // "Connected" now reflects real capability: own DB creds OR the global env
  // fallback (default studio). Fixes Canggu showing "not connected".
  const connected = wa.hasConfig
  const fullyLive = connected && wa.enabled

  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const studioAdmin = studio.admins.find((a) => a.role === "ADMIN") ?? null

  const [checking, setChecking] = useState(false)
  const [health, setHealth] = useState<HealthResult | null>(null)
  // Studio name is edited ONLY here in super-admin (regular admins can't).
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(studio.name)
  const [savingName, setSavingName] = useState(false)
  const lastOut = wa.lastOutboundAt
    ? (() => { try { return formatDistanceToNow(new Date(wa.lastOutboundAt), { addSuffix: true }) } catch { return null } })()
    : null

  const checkHealth = async () => {
    setChecking(true)
    setHealth(null)
    try {
      const res = await fetch("/api/sadmin/whatsapp-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId: studio.id }),
      })
      const j = await res.json().catch(() => ({}))
      setHealth(j.health ?? { ok: false, error: "No response" })
    } catch {
      setHealth({ ok: false, error: "Network error" })
    } finally {
      setChecking(false)
    }
  }

  const toggle = async () => {
    await fetch("/api/sadmin/studios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: studio.id, whatsappEnabled: !wa.enabled }),
    })
    onChanged()
  }

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
                <h2 className="font-bold text-gray-900 truncate">{studio.name}</h2>
                <button type="button" onClick={() => { setNameVal(studio.name); setEditingName(true) }} aria-label="Edit studio name" className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-gray-50"><Pencil size={13} /></button>
              </>
            )}
            <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{studio.slug}</span>
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
            {wa.usesEnvFallback
              ? "Using the global WhatsApp credentials (env)."
              : connected
                ? <>From <span className="font-mono">{wa.displayPhone ?? "—"}</span> · Phone ID <span className="font-mono">{wa.phoneNumberId}</span></>
                : "Click Connect to wire this studio's WhatsApp Business account."}
          </div>
          {connected && (
            <div className="text-[11px] text-gray-500 mt-1">
              Last message sent: {lastOut ? <span className="font-medium text-gray-700">{lastOut}</span> : <span className="text-gray-400">never</span>}
            </div>
          )}
          {connected && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <button
                onClick={checkHealth}
                disabled={checking}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                {checking ? "Checking…" : "Check connection"}
              </button>
              {health && (
                health.ok ? (
                  <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 size={12} /> Working
                    {health.verifiedName ? ` · ${health.verifiedName}` : ""}
                    {health.qualityRating ? ` · ${health.qualityRating}` : ""}
                  </span>
                ) : (
                  <span className="text-[11px] text-red-600 inline-flex items-center gap-1">
                    <AlertCircle size={12} /> {health.error}
                  </span>
                )
              )}
            </div>
          )}
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
  const [form, setForm] = useState({ name: "", slug: "", adminEmail: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // After creation we show the auto-generated starter password once.
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)

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
    const res = await fetch("/api/sadmin/studios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
        <Field label="Studio name" hint="Public display name, e.g. Gravity Stretching Bali">
          <input
            required
            value={form.name}
            onChange={(e) => handleSlugSuggest(e.target.value)}
            placeholder="Gravity Stretching Bali"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </Field>
        <Field label="Slug" hint="Used in the URL — e.g. bookgravity.com/bali. lowercase, dashes only.">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 flex-shrink-0">bookgravity.com/</span>
            <input
              required
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
              placeholder="bali"
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
    const res = await fetch("/api/sadmin/studios", {
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
    await fetch("/api/sadmin/studios", {
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
