"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

// Opens the in-app chat (internal inbox conversation) for a client by phone.
// Resolves/creates the conversation server-side, then navigates to the inbox
// deep-link (?c=<id>) so the admin can read the full conversation history in
// the system — instead of jumping out to the external WhatsApp app.
export function useOpenChat(basePath: string = "/admin/inbox") {
  const router = useRouter()
  const [opening, setOpening] = useState(false)

  const openChat = useCallback(
    async (phone: string, name?: string | null) => {
      if (opening) return
      setOpening(true)
      try {
        const res = await fetch("/api/whatsapp/conversations/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, name: name ?? undefined }),
        })
        if (!res.ok) {
          alert("Не удалось открыть чат с клиентом.")
          return
        }
        const { id } = (await res.json()) as { id: string }
        router.push(`${basePath}?c=${id}`)
      } catch {
        alert("Сетевая ошибка — не удалось открыть чат.")
      } finally {
        setOpening(false)
      }
    },
    [router, basePath, opening],
  )

  return { openChat, opening }
}
