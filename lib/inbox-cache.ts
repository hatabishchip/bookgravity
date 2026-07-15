// Instant-open cache for the WhatsApp inbox (owner 15.07, "open it like
// Telegram/WhatsApp - no Loading spinner"). Real messengers render from a
// local mirror first, then reconcile with the network in the background. We do
// the same with localStorage:
//
//   - the conversation LIST under one key (small),
//   - per-chat DETAIL under an LRU capped to the last N chats, each trimmed to
//     the last M messages, so localStorage never overflows.
//
// Everything degrades safely: any parse/quota error just means "no cache" and
// the UI falls back to the current network-load behaviour. Nothing here is a
// source of truth - the server always wins on the next background refresh.

const VERSION = "v1"
const LIST_KEY = (role: string) => `bg.inbox.${VERSION}.${role}.list`
const DETAIL_KEY = (role: string, id: string) => `bg.inbox.${VERSION}.${role}.chat.${id}`
const INDEX_KEY = (role: string) => `bg.inbox.${VERSION}.${role}.index` // LRU order of chat ids

const MAX_CHATS = 30 // how many chat details we keep on disk
const MAX_MESSAGES = 60 // per chat, keep only the most recent

function safeGet(key: string): string | null {
  try { return typeof window !== "undefined" ? window.localStorage.getItem(key) : null } catch { return null }
}
function safeSet(key: string, val: string): boolean {
  try { window.localStorage.setItem(key, val); return true } catch { return false }
}
function safeRemove(key: string) {
  try { window.localStorage.removeItem(key) } catch {}
}

// ---- Conversation list ----------------------------------------------------

export function readListCache<T>(role: string): T | null {
  const raw = safeGet(LIST_KEY(role))
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export function writeListCache(role: string, list: unknown): void {
  try { safeSet(LIST_KEY(role), JSON.stringify(list)) } catch {}
}

// ---- LRU index ------------------------------------------------------------

function readIndex(role: string): string[] {
  const raw = safeGet(INDEX_KEY(role))
  if (!raw) return []
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : [] } catch { return [] }
}
function writeIndex(role: string, ids: string[]) {
  safeSet(INDEX_KEY(role), JSON.stringify(ids))
}

// Move id to front; evict least-recently-used detail beyond MAX_CHATS.
function touchIndex(role: string, id: string) {
  let ids = readIndex(role).filter((x) => x !== id)
  ids.unshift(id)
  const evicted = ids.slice(MAX_CHATS)
  ids = ids.slice(0, MAX_CHATS)
  for (const gone of evicted) safeRemove(DETAIL_KEY(role, gone))
  writeIndex(role, ids)
}

// ---- Conversation detail --------------------------------------------------

type WithMessages = { messages?: unknown[] }

export function readDetailCache<T>(role: string, id: string): T | null {
  const raw = safeGet(DETAIL_KEY(role, id))
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export function writeDetailCache(role: string, id: string, detail: WithMessages): void {
  // Trim to the most recent messages so one long chat can't blow the budget.
  const trimmed: WithMessages = {
    ...detail,
    messages: Array.isArray(detail.messages) ? detail.messages.slice(-MAX_MESSAGES) : detail.messages,
  }
  const ok = safeSet(DETAIL_KEY(role, id), JSON.stringify(trimmed))
  if (!ok) {
    // Quota hit: drop the oldest half of cached chats and retry once.
    const ids = readIndex(role)
    for (const gone of ids.slice(Math.ceil(ids.length / 2))) safeRemove(DETAIL_KEY(role, gone))
    writeIndex(role, ids.slice(0, Math.ceil(ids.length / 2)))
    safeSet(DETAIL_KEY(role, id), JSON.stringify(trimmed))
  }
  touchIndex(role, id)
}
