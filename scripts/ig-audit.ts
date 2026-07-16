// Full IG DM audit: every conversation, full recent history, who has the
// last word, how old the window is. Read-only.
import "dotenv/config"

const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN!
const SELF = process.env.IG_SELF_ID || "17841425426772959"
const G = "https://graph.instagram.com/v21.0"

;(async () => {
  let url = `${G}/me/conversations?fields=participants,updated_time,messages.limit(20)%7Bid,from,message,created_time%7D&limit=50&access_token=${TOKEN}`
  let n = 0
  while (url) {
    const r = await fetch(url)
    const j = (await r.json()) as { data?: unknown[]; paging?: { next?: string }; error?: { message: string } }
    if (j.error) { console.log("ERR:", j.error.message); break }
    for (const c of (j.data ?? []) as {
      participants?: { data?: { username?: string; id?: string }[] }
      updated_time?: string
      messages?: { data?: { from?: { id?: string; username?: string }; message?: string; created_time?: string }[] }
    }[]) {
      n++
      const peer = (c.participants?.data ?? []).find((p) => p.id !== SELF)
      const msgs = (c.messages?.data ?? []).filter((m) => (m.message ?? "").length > 0)
      if (!msgs.length) { console.log(`\n=== @${peer?.username} (пусто)`); continue }
      const last = msgs[0]
      const lastInbound = last.from?.id !== SELF
      const ageH = Math.round((Date.now() - new Date(last.created_time!).getTime()) / 3600000)
      console.log(`\n=== @${peer?.username} | последний: ${lastInbound ? "КЛИЕНТ" : "студия"} | ${ageH}ч назад (${last.created_time?.slice(0, 16)})`)
      for (const m of [...msgs].reverse().slice(-6)) {
        const who = m.from?.id === SELF ? "СТУДИЯ" : "КЛИЕНТ"
        console.log(`  ${m.created_time?.slice(5, 16)} ${who}: ${(m.message ?? "").replace(/\n/g, " ").slice(0, 130)}`)
      }
    }
    url = j.paging?.next ?? ""
  }
  console.log(`\nВсего диалогов: ${n}`)
})()
