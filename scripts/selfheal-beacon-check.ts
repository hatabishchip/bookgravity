// One-shot: подсчёт self-heal beacon'ов (scope "native:recovered") за последние 24ч.
// Проверка замыкания цикла «ноль белых экранов» после OTA v4 (вотчдог оболочки).
// Usage: npx tsx scripts/selfheal-beacon-check.ts
import "dotenv/config"
import { prisma } from "../lib/prisma"

async function main() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const rows = await prisma.eventLog.findMany({
    where: { scope: "native:recovered", createdAt: { gte: since } },
    select: { message: true, data: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  const buckets = {
    "webview-self-heal (app-shell)": 0, // вотчдог нативной оболочки
    "global-error self-heal (web)": 0,
    "segment chunk self-heal (web)": 0,
    "web-self-heal (web layout)": 0,
    other: 0,
  }

  for (const r of rows) {
    const m = (r.message || "").toLowerCase()
    if (m.includes("webview-self-heal")) buckets["webview-self-heal (app-shell)"]++
    else if (m.includes("global-error")) buckets["global-error self-heal (web)"]++
    else if (m.includes("segment chunk")) buckets["segment chunk self-heal (web)"]++
    else if (m.includes("web-self-heal")) buckets["web-self-heal (web layout)"]++
    else buckets.other++
  }

  const result = {
    total: rows.length,
    buckets,
    latest: rows.slice(0, 5).map((r) => ({
      at: r.createdAt.toISOString(),
      message: r.message,
    })),
  }
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((e) => {
    console.error("ERR", e?.message || e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
