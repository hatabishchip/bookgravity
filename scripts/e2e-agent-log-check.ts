// E2E: mint an admin session cookie (prod AUTH_SECRET) and hit /api/admin/agent-log.
import { encode } from "next-auth/jwt"
import "dotenv/config"

;(async () => {
  const secret = process.env.AUTH_SECRET!
  const token = await encode({
    token: { sub: "cemk5zlxhw0mp474eb3", role: "SUPER_ADMIN", studioId: "studio_canggu_1778764028263" },
    secret,
    salt: "__Secure-authjs.session-token",
  })
  const r = await fetch("https://bookgravity.com/api/admin/agent-log?page=1", {
    headers: { cookie: `__Secure-authjs.session-token=${token}` },
  })
  const j = (await r.json()) as { total: number; items: { clientName: string; status: string; question: string | null; answer: string | null }[] }
  console.log("HTTP", r.status, "total:", j.total)
  for (const it of (j.items ?? []).slice(0, 4)) {
    console.log("-", it.clientName, `[${it.status}]`, "Q:", (it.question ?? "").slice(0, 60), "| A:", (it.answer ?? "").slice(0, 60))
  }
})()
