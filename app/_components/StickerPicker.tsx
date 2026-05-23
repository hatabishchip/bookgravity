"use client"

import { useCallback, useRef, useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Built-in sticker picker.
//
// WhatsApp stickers are 512×512 WebP files (static or animated). We don't
// ship binary sticker assets; instead, when the user taps an emoji we
// render that emoji at high res onto a canvas and export it as WebP. The
// result is a real .webp file that Meta accepts as a `type: sticker`.
//
// Rendered blobs are cached in-memory so the second tap on the same
// sticker is instant.
//
// Categories ship a curated 60-emoji starter pack across faces / gestures /
// objects / animals / love / sports. Future work: allow admin-uploaded
// custom packs to appear alongside.
// ---------------------------------------------------------------------------

type Category = {
  id: string
  label: string
  emojis: string[]
}

const CATEGORIES: Category[] = [
  {
    id: "recent",
    label: "Часто",
    emojis: [], // populated from localStorage at runtime
  },
  {
    id: "faces",
    label: "Эмоции",
    emojis: [
      "😀", "😂", "🤣", "😊", "🥰", "😍", "😘", "🥲",
      "😎", "🤩", "🥳", "🤔", "😴", "🙄", "😏", "😒",
      "😬", "🤐", "😤", "😢", "😭", "🤯", "🥺", "😱",
    ],
  },
  {
    id: "gestures",
    label: "Жесты",
    emojis: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤙", "👏",
      "🙏", "💪", "🤝", "🙌", "👋", "🫶", "🫱", "🫲",
    ],
  },
  {
    id: "love",
    label: "Сердечки",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
      "💔", "❣️", "💕", "💖", "💗", "💓", "💞", "💝",
    ],
  },
  {
    id: "celebration",
    label: "Праздник",
    emojis: [
      "🎉", "🎊", "🥂", "🍾", "🎁", "🎂", "🍰", "🎈",
      "🎆", "🎇", "✨", "💫", "🌟", "⭐", "🔥", "💯",
    ],
  },
  {
    id: "fitness",
    label: "Спорт",
    emojis: [
      "🧘", "🧘‍♀️", "🧘‍♂️", "🤸", "🤸‍♀️", "🤸‍♂️", "🏃", "🏃‍♀️",
      "🏃‍♂️", "💃", "🕺", "🏋️", "🏋️‍♀️", "🤾", "🏆", "🥇",
    ],
  },
  {
    id: "nature",
    label: "Природа",
    emojis: [
      "🌸", "🌺", "🌻", "🌹", "🌷", "🌿", "🍀", "🌴",
      "🌊", "☀️", "🌙", "⭐", "🌈", "❄️", "🦋", "🐢",
    ],
  },
]

const STICKER_SIZE = 512 // px — matches Meta's requirement

// Cache of rendered emoji → WebP blob so repeat sends are instant.
const blobCache = new Map<string, Blob>()

async function renderEmojiToWebP(emoji: string): Promise<Blob> {
  const cached = blobCache.get(emoji)
  if (cached) return cached
  const canvas = document.createElement("canvas")
  canvas.width = STICKER_SIZE
  canvas.height = STICKER_SIZE
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  // Transparent background — Meta expects sticker WebPs without solid bg.
  ctx.clearRect(0, 0, STICKER_SIZE, STICKER_SIZE)
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  // Use the platform's emoji font. On iOS the device renders Apple Color
  // Emoji; on Android it's Noto Color Emoji. The exact glyph differs
  // between platforms but the *recipient* sees what their own OS renders
  // because WhatsApp simply forwards the WebP we built.
  ctx.font = `${STICKER_SIZE * 0.78}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`
  // Emoji baseline sits slightly above center; nudge up a bit.
  ctx.fillText(emoji, STICKER_SIZE / 2, STICKER_SIZE / 2 + STICKER_SIZE * 0.04)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/webp",
      0.9,
    )
  })
  blobCache.set(emoji, blob)
  return blob
}

const RECENT_KEY = "wa-inbox-recent-stickers"
const RECENT_LIMIT = 16

function loadRecent(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.filter((s) => typeof s === "string").slice(0, RECENT_LIMIT)
  } catch {}
  return []
}

function saveRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_LIMIT)))
  } catch {}
}

export interface StickerPickerProps {
  /** Called when the user picks a sticker. The handler is responsible for
   *  uploading + sending — the picker just hands over a ready-to-send File. */
  onPick: (file: File) => Promise<void> | void
}

export default function StickerPicker({ onPick }: StickerPickerProps) {
  const [activeCat, setActiveCat] = useState<string>("recent")
  const [recent, setRecent] = useState<string[]>(() => loadRecent())
  const [busy, setBusy] = useState<string | null>(null)
  const recentRef = useRef(recent)
  recentRef.current = recent

  const handlePick = useCallback(
    async (emoji: string) => {
      if (busy) return
      setBusy(emoji)
      try {
        const blob = await renderEmojiToWebP(emoji)
        const file = new File([blob], "sticker.webp", { type: "image/webp" })
        await onPick(file)
        // Promote to "recent": move to front, dedupe, cap.
        const next = [emoji, ...recentRef.current.filter((e) => e !== emoji)].slice(
          0,
          RECENT_LIMIT,
        )
        setRecent(next)
        saveRecent(next)
      } catch (err) {
        console.warn("[StickerPicker] failed to send sticker:", err)
      } finally {
        setBusy(null)
      }
    },
    [busy, onPick],
  )

  const visibleCats: Category[] = CATEGORIES.map((c) =>
    c.id === "recent" ? { ...c, emojis: recent } : c,
  )
  const activeEmojis =
    visibleCats.find((c) => c.id === activeCat)?.emojis ?? []

  return (
    <div
      className="bg-[#D1D5DB] dark:bg-[#1F1F22] select-none flex flex-col"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
    >
      {/* Category tabs */}
      <div className="flex gap-1 px-2 pt-2 overflow-x-auto scrollbar-none">
        {visibleCats.map((c) => {
          const isActive = activeCat === c.id
          const disabled = c.id === "recent" && c.emojis.length === 0
          return (
            <button
              key={c.id}
              type="button"
              tabIndex={-1}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => !disabled && setActiveCat(c.id)}
              disabled={disabled}
              className={cn(
                "text-[12px] px-3 py-1.5 rounded-full flex-shrink-0 transition-colors",
                isActive
                  ? "bg-white text-black dark:bg-white dark:text-black"
                  : "bg-transparent text-gray-700 dark:text-gray-300",
                disabled && "opacity-40",
              )}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Emoji grid */}
      <div className="grid grid-cols-6 sm:grid-cols-8 gap-1 p-2 overflow-y-auto"
           style={{ maxHeight: 280 }}>
        {activeEmojis.length === 0 && activeCat === "recent" && (
          <div className="col-span-full text-center text-xs text-gray-500 dark:text-gray-400 py-8">
            <Search size={20} className="inline mb-1 opacity-50" />
            <div>Тут появятся стикеры, которые ты отправлял.</div>
          </div>
        )}
        {activeEmojis.map((emoji) => (
          <button
            key={emoji + activeCat}
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => handlePick(emoji)}
            disabled={busy === emoji}
            className={cn(
              "aspect-square rounded-lg flex items-center justify-center transition-[transform,opacity] duration-75",
              "text-4xl sm:text-5xl select-none",
              "active:scale-90 active:opacity-70",
              busy === emoji && "opacity-40",
            )}
            aria-label={`Отправить стикер ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
