// Unanswered-client digest, grouped by assigned trainer, for the OWNER to relay
// to each coach ("you have N new client messages waiting"). A conversation is
// "waiting" when the last message is inbound (client spoke last, no reply after).
//
// Focus on RECENT waits (default 72h) - the actionable ones - and report the
// older backlog only as a count so the digest isn't buried in dead threads.
//
// Usage:
//   npx tsx scripts/unanswered-digest.ts --print        # print to stdout
//   npx tsx scripts/unanswered-digest.ts                # send to owner's personal Telegram
// Env: DATABASE_URL, TURSO_AUTH_TOKEN (from .env.local). Send uses ~/.claude/notify-tg.sh --bot=personal.
import { createClient } from "@libsql/client"
import { execFileSync } from "child_process"
import { homedir } from "os"
import { join } from "path"
import "dotenv/config"

const WINDOW_H = Number(process.env.DIGEST_WINDOW_HOURS || 72) // "recent" cutoff
const SEND = !process.argv.includes("--print")

const c = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })

function ago(d: string, now: number): string {
  const ms = now - Date.parse(d)
  const h = Math.floor(ms / 3.6e6)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 6e4))}м`
  if (h < 24) return `${h}ч`
  return `${Math.floor(h / 24)}д`
}

async function build(): Promise<string> {
  // Stable "now" for the whole run (Date.now once).
  const now = Date.now()
  const trainers = await c.execute("SELECT id, name FROM Trainer WHERE archived = 0")
  const name = new Map((trainers.rows as { id: string; name: string }[]).map((t) => [t.id, t.name]))

  const conv = await c.execute(
    "SELECT clientName, clientPhone, assignedTrainerId, lastInboundAt, lastMessageAt, adSourceId FROM WhatsAppConversation WHERE lastInboundAt IS NOT NULL",
  )
  type Row = { clientName: string | null; clientPhone: string; assignedTrainerId: string | null; lastInboundAt: string; lastMessageAt: string | null; adSourceId: string | null }
  // Waiting = client had the last word (no outbound after the last inbound).
  const waiting = (conv.rows as unknown as Row[]).filter(
    (r) => r.lastMessageAt && r.lastInboundAt && r.lastMessageAt <= r.lastInboundAt,
  )
  const cutoff = now - WINDOW_H * 3.6e6
  const recent = waiting.filter((r) => Date.parse(r.lastInboundAt) >= cutoff)
  const older = waiting.length - recent.length

  // Group recent by trainer, most-waiting first.
  const byTr = new Map<string, Row[]>()
  for (const w of recent) {
    const k = w.assignedTrainerId || "__none"
    if (!byTr.has(k)) byTr.set(k, [])
    byTr.get(k)!.push(w)
  }
  const groups = [...byTr.entries()].sort((a, b) => b[1].length - a[1].length)

  const dateStr = new Date(now).toLocaleString("ru-RU", { timeZone: "Asia/Makassar", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  const lines: string[] = [`📥 Неотвеченные клиенты - ${dateStr} (Бали)`, ""]
  if (groups.length === 0) {
    lines.push("Все свежие сообщения отвечены. 👍")
  } else {
    for (const [tid, list] of groups) {
      const tn = tid === "__none" ? "Без тренера (не назначен)" : name.get(tid) || "тренер ?"
      const who = list
        .sort((a, b) => a.lastInboundAt.localeCompare(b.lastInboundAt))
        .map((w) => `${(w.clientName || w.clientPhone || "?").slice(0, 22)} (${ago(w.lastInboundAt, now)}${w.adSourceId ? ", реклама" : ""})`)
        .join(", ")
      lines.push(`${tn} - ${list.length}:`)
      lines.push(`  ${who}`)
    }
  }
  lines.push("")
  lines.push(`За последние ${WINDOW_H}ч. Старый бэклог (>${WINDOW_H}ч): ещё ${older} чатов.`)
  return lines.join("\n")
}

;(async () => {
  const text = await build()
  if (SEND) {
    execFileSync(join(homedir(), ".claude/notify-tg.sh"), ["--bot=personal", `--text=${text}`], { stdio: "inherit" })
  } else {
    console.log(text)
  }
})().catch((e) => {
  console.error(String(e).slice(0, 300))
  process.exit(1)
})
