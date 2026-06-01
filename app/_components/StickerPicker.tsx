"use client"

import { useCallback, useRef, useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Emoji picker for the composer.
//
// Tapping an emoji inserts the character at the caret in the textarea
// (handled by the parent Composer), so the user can mix emoji with text:
//   "Спасибо за бронь 🙏 жду тебя завтра"
//
// "Recent" tracks which emoji you've actually used and surfaces them in
// the first tab. (Previously the picker rendered each emoji to WebP and
// sent it as a real Meta sticker — that mode is gone since the user
// wanted in-line emoji rather than standalone stickers.)
// ---------------------------------------------------------------------------

type Category = {
  id: string
  label: string
  emojis: string[]
}

const CATEGORIES: Category[] = [
  {
    id: "recent",
    label: "Frequent",
    emojis: [], // populated from localStorage at runtime
  },
  {
    id: "faces",
    label: "Smileys",
    emojis: [
      "😀", "😂", "🤣", "😊", "🥰", "😍", "😘", "🥲",
      "😎", "🤩", "🥳", "🤔", "😴", "🙄", "😏", "😒",
      "😬", "🤐", "😤", "😢", "😭", "🤯", "🥺", "😱",
    ],
  },
  {
    id: "gestures",
    label: "Gestures",
    emojis: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤙", "👏",
      "🙏", "💪", "🤝", "🙌", "👋", "🫶", "🫱", "🫲",
    ],
  },
  {
    id: "love",
    label: "Hearts",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
      "💔", "❣️", "💕", "💖", "💗", "💓", "💞", "💝",
    ],
  },
  {
    id: "celebration",
    label: "Party",
    emojis: [
      "🎉", "🎊", "🥂", "🍾", "🎁", "🎂", "🍰", "🎈",
      "🎆", "🎇", "✨", "💫", "🌟", "⭐", "🔥", "💯",
    ],
  },
  {
    id: "fitness",
    label: "Sport",
    emojis: [
      "🧘", "🧘‍♀️", "🧘‍♂️", "🤸", "🤸‍♀️", "🤸‍♂️", "🏃", "🏃‍♀️",
      "🏃‍♂️", "💃", "🕺", "🏋️", "🏋️‍♀️", "🤾", "🏆", "🥇",
    ],
  },
  {
    id: "nature",
    label: "Nature",
    emojis: [
      "🌸", "🌺", "🌻", "🌹", "🌷", "🌿", "🍀", "🌴",
      "🌊", "☀️", "🌙", "⭐", "🌈", "❄️", "🦋", "🐢",
    ],
  },
]

const RECENT_KEY = "wa-inbox-recent-emojis"
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
  /** Called when the user picks an emoji. Composer is expected to insert the
   *  character into the textarea at the caret position. */
  onPick: (emoji: string) => void
}

export default function StickerPicker({ onPick }: StickerPickerProps) {
  const [activeCat, setActiveCat] = useState<string>("recent")
  const [recent, setRecent] = useState<string[]>(() => loadRecent())
  const recentRef = useRef(recent)
  recentRef.current = recent

  const handlePick = useCallback(
    (emoji: string) => {
      onPick(emoji)
      // Promote to "recent": move to front, dedupe, cap.
      const next = [emoji, ...recentRef.current.filter((e) => e !== emoji)].slice(
        0,
        RECENT_LIMIT,
      )
      setRecent(next)
      saveRecent(next)
    },
    [onPick],
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
            <div>Stickers you&apos;ve sent will appear here.</div>
          </div>
        )}
        {activeEmojis.map((emoji) => (
          <button
            key={emoji + activeCat}
            type="button"
            tabIndex={-1}
            // Insert on pointerdown for the same "instant" feel as the
            // virtual keyboard keys — no waiting for click.
            onPointerDown={(e) => {
              e.preventDefault()
              handlePick(emoji)
            }}
            onMouseDown={(e) => e.preventDefault()}
            className={cn(
              "aspect-square rounded-lg flex items-center justify-center transition-[transform,opacity] duration-75",
              "text-4xl sm:text-5xl select-none",
              "active:scale-90 active:opacity-70",
            )}
            aria-label={`Insert emoji ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
