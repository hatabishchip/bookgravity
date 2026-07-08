// Weekly ad-performance digest for the OWNER: per-ad Meta stats (spend, CTR,
// leads, cost-per-lead) for last 7 days + all-time, with a plain-language flag
// (scale / fatigue / weak) so he sees which video ads to push or cut. Sent to
// his personal Telegram. Read-only Meta call - no changes to any campaign.
//
// Usage:
//   npx tsx scripts/ad-performance-digest.ts --print   # stdout
//   npx tsx scripts/ad-performance-digest.ts           # send to owner's personal TG
// Creds from .env.local: FB_ADS_TOKEN, FB_ADS_CAMPAIGN_ID (or FB_AD_ACCOUNT_ID), FB_GRAPH_BASE.
import { execFileSync } from "child_process"
import { readFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

// Load .env.local (FB creds live there; not the default .env dotenv reads).
function loadEnvLocal() {
  try {
    for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
    }
  } catch { /* fall back to process env */ }
}
loadEnvLocal()

const SEND = !process.argv.includes("--print")
const TOKEN = process.env.FB_ADS_TOKEN
const CAMP = process.env.FB_ADS_CAMPAIGN_ID
const ACC = process.env.FB_AD_ACCOUNT_ID
const BASE = process.env.FB_GRAPH_BASE || "https://graph.facebook.com/v21.0"
const NODE = CAMP || ACC
const LEAD = "onsite_conversion.messaging_conversation_started_7d"

type AdRow = { name: string; spend: number; ctr: number; leads: number }

async function fetchAds(preset: string): Promise<AdRow[]> {
  const url = `${BASE}/${NODE}/insights?level=ad&date_preset=${preset}` +
    `&fields=ad_name,spend,ctr,actions&limit=100&access_token=${TOKEN}`
  const res = await fetch(url, { cache: "no-store" as RequestCache })
  if (!res.ok) throw new Error(`Meta ${res.status}`)
  const json = await res.json()
  return (json.data || []).map((r: { ad_name?: string; spend?: string; ctr?: string; actions?: { action_type: string; value: string }[] }) => {
    const leads = (r.actions || []).find((a) => a.action_type === LEAD)
    return { name: r.ad_name || "?", spend: parseFloat(r.spend || "0"), ctr: parseFloat(r.ctr || "0"), leads: parseInt(leads?.value || "0", 10) }
  })
}

// Short name: drop the "GRAVITY CTWA - " / "STRAP" boilerplate.
function short(n: string): string {
  return n.replace(/GRAVITY CTWA\s*-\s*/i, "").replace(/\s*-\s*STRAP/i, "").replace(/Новое объявление.*/i, "Вовлечённость").slice(0, 18)
}
const money = (n: number) => "$" + n.toFixed(2)

async function build(): Promise<string> {
  if (!TOKEN || !NODE) return "Реклама: не заданы FB_ADS_TOKEN / FB_ADS_CAMPAIGN_ID."
  const [all, week] = await Promise.all([fetchAds("maximum"), fetchAds("last_7d")])
  const weekBy = new Map(week.map((r) => [r.name, r]))

  const totAll = all.reduce((s, r) => s + r.spend, 0)
  const totLeads = all.reduce((s, r) => s + r.leads, 0)
  const totWeek = week.reduce((s, r) => s + r.spend, 0)
  const totWeekLeads = week.reduce((s, r) => s + r.leads, 0)

  const rows = [...all].sort((a, b) => b.leads - a.leads)
  const lines: string[] = ["📊 Реклама - разбор роликов (Чангу CTWA)", ""]
  lines.push(`Итого: трата ${money(totAll)}, лидов ${totLeads}, CPL ${totLeads ? money(totAll / totLeads) : "-"}.`)
  lines.push(`7 дней: ${money(totWeek)}, лидов ${totWeekLeads}.`)
  lines.push("")
  for (const r of rows) {
    const cpl = r.leads ? r.spend / r.leads : null
    const w = weekBy.get(r.name)
    const cplW = w && w.leads ? w.spend / w.leads : null
    // Flag: fatigue if 7d CPL noticeably worse than all-time; strong if cheap; weak if pricey.
    let flag = ""
    if (cpl != null && cplW != null && cplW > cpl * 1.4) flag = " ⚠️ дорожает"
    else if (cpl != null && cpl <= 1.5) flag = " ✅ дёшево"
    else if (cpl != null && cpl >= 5) flag = " ❌ дорого"
    lines.push(`${short(r.name).padEnd(15)} лид ${r.leads}  CPL ${cpl ? money(cpl) : "-"}  CTR ${r.ctr.toFixed(1)}%${flag}`)
  }
  lines.push("")
  lines.push("✅ масштабировать · ⚠️ обновить креатив · ❌ отключить. Данные Meta, read-only.")
  return lines.join("\n")
}

;(async () => {
  const text = await build()
  if (SEND) execFileSync(join(homedir(), ".claude/notify-tg.sh"), ["--bot=personal", `--text=${text}`], { stdio: "inherit" })
  else console.log(text)
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1) })
