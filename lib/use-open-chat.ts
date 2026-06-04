"use client"

import { useCallback, useState } from "react"

// Opens the in-app chat (internal inbox conversation) for a client by phone.
// Resolves/creates the conversation server-side, then dispatches a global
// event that the FloatingInbox listens for — so the SAME chat modal opens
// straight onto that client's conversation, overlaying the current page.
// Closing the modal returns the user to exactly where they were (no
// navigation, no studio header).
export function useOpenChat() {
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
        window.dispatchEvent(new CustomEvent("bg:open-chat", { detail: { id } }))
      } catch {
        alert("Сетевая ошибка — не удалось открыть чат.")
      } finally {
        setOpening(false)
      }
    },
    [opening],
  )

  return { openChat, opening }
}
