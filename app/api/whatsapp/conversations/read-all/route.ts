import { NextResponse } from "next/server"
import { requireAuth, isAdminRole } from "@/lib/auth-helpers"
import { isStudioWhatsAppEnabled } from "@/lib/whatsapp-feature"
import { markAllConversationsReadForAdmin } from "@/lib/whatsapp-conversation"

// POST /api/whatsapp/conversations/read-all
// Admin-only: zero the admin unread counter for every conversation in the
// studio. Clears a historical backlog in one tap (the app-icon badge + the
// inbox both read from unreadAdmin). Studio-scoped, so it never touches
// another studio's chats.
export async function POST() {
  const ctx = await requireAuth()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdminRole(ctx.role)) return NextResponse.json({ error: "Admin only" }, { status: 403 })
  if (!(await isStudioWhatsAppEnabled(ctx.studioId))) {
    return NextResponse.json({ error: "WhatsApp not enabled for this studio" }, { status: 403 })
  }
  const cleared = await markAllConversationsReadForAdmin(ctx.studioId)
  return NextResponse.json({ ok: true, cleared })
}
