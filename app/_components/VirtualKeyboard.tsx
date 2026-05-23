"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { ArrowUp, Delete, Globe } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// WhatsApp-styled in-page keyboard for the Inbox composer.
//
// Visual reference: iOS WhatsApp dark keyboard.
//   • Dark background, light gray pill-shaped keys, white text
//   • 11 / 11 / 9 layout for Russian (and English padded to match)
//   • Special keys (Shift, Backspace, 123, Globe, Return) are a touch
//     darker than letter keys
//   • Language abbreviation shown bottom-right inside the space bar
//
// We render NO Send button — the green Send button in the composer above
// handles that, matching WhatsApp where the keyboard itself never sends.
// ---------------------------------------------------------------------------

type Lang = "en" | "ru"
type Layer = "letters" | "symbols"

const LETTERS_EN: string[][] = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
]

const LETTERS_RU: string[][] = [
  ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х"],
  ["ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"],
  ["я", "ч", "с", "м", "и", "т", "ь", "б", "ю"],
]

const SYMBOLS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""],
  ["#", "+", "=", ".", ",", "?", "!", "'"],
]

const SPACE_LABEL: Record<Lang, string> = { en: "english", ru: "русский" }
const LANG_HINT: Record<Lang, string> = { en: "en", ru: "ру" }

export interface VirtualKeyboardProps {
  onInsert: (text: string) => void
  onBackspace: () => void
}

export default function VirtualKeyboard({
  onInsert,
  onBackspace,
}: VirtualKeyboardProps) {
  const [lang, setLang] = useState<Lang>("ru")
  const [layer, setLayer] = useState<Layer>("letters")
  const [shift, setShift] = useState(false)

  const rows: string[][] =
    layer === "symbols" ? SYMBOLS : lang === "ru" ? LETTERS_RU : LETTERS_EN

  const pressKey = useCallback(
    (ch: string) => {
      onInsert(shift && layer === "letters" ? ch.toUpperCase() : ch)
      if (shift) setShift(false) // one-shot shift, iOS-style
    },
    [onInsert, shift, layer],
  )

  // Press-and-hold helper. On pointerdown we fire once immediately,
  // then schedule a repeating tick after a short initial delay. On
  // pointerup/leave/cancel we clear the timers. Mirrors how native
  // keyboards auto-repeat when the user holds backspace.
  const holdTimers = useRef<{ initial: ReturnType<typeof setTimeout> | null; tick: ReturnType<typeof setInterval> | null }>({ initial: null, tick: null })
  const stopHold = useCallback(() => {
    if (holdTimers.current.initial) {
      clearTimeout(holdTimers.current.initial)
      holdTimers.current.initial = null
    }
    if (holdTimers.current.tick) {
      clearInterval(holdTimers.current.tick)
      holdTimers.current.tick = null
    }
  }, [])
  const startHold = useCallback(
    (action: () => void) => {
      // First fire immediately so the action feels instant on tap.
      action()
      // After 400ms, begin repeating every 50ms.
      holdTimers.current.initial = setTimeout(() => {
        holdTimers.current.tick = setInterval(action, 50)
      }, 400)
    },
    [],
  )
  // Safety: clear timers if the component unmounts mid-hold.
  useEffect(() => {
    return () => stopHold()
  }, [stopHold])

  const Key = ({
    label,
    onPress,
    flex = 1,
    variant = "letter",
  }: {
    label: React.ReactNode
    onPress: () => void
    flex?: number
    variant?: "letter" | "modifier" | "active" | "space"
  }) => (
    <button
      type="button"
      tabIndex={-1}
      // Insert on POINTERDOWN, not click — the character appears the
      // instant the finger touches the key instead of waiting for the
      // touchend+click round-trip (~70-150ms on iOS). preventDefault
      // also stops Safari from moving focus to the button, so the
      // textarea above keeps its caret.
      onPointerDown={(e) => {
        e.preventDefault()
        onPress()
      }}
      // mousedown is preventDefault'd as a fallback for older browsers
      // that don't dispatch pointer events.
      onMouseDown={(e) => e.preventDefault()}
      style={{ flex }}
      className={cn(
        "rounded-[6px] font-normal select-none active:opacity-70 transition-opacity",
        "flex items-center justify-center",
        "h-[44px] sm:h-[46px]",
        // Light theme palette (matches iOS light keyboard)
        // Dark theme palette (matches iOS dark keyboard, our previous look)
        variant === "letter" &&
          "bg-white text-black shadow-sm text-[22px] sm:text-[24px] dark:bg-[#6C6C70] dark:text-white dark:shadow-none",
        variant === "space" &&
          "bg-white text-black shadow-sm text-[15px] dark:bg-[#6C6C70] dark:text-white dark:shadow-none",
        variant === "modifier" &&
          "bg-[#ADB3BC] text-black text-[18px] dark:bg-[#3C3C3F] dark:text-white",
        variant === "active" &&
          "bg-black text-white text-[18px] dark:bg-white dark:text-black",
      )}
    >
      {label}
    </button>
  )

  return (
    <div
      className="bg-[#D1D5DB] dark:bg-[#1F1F22] px-1 pt-2 pb-1.5 select-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
    >
      {/* Letter / symbol rows */}
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1
        return (
          <div key={i} className="flex gap-[5px] mb-[6px]">
            {/* Shift on the left of the last letter row.
                In the symbols layer Shift's slot is taken by #+= toggle
                (we keep it simple and just skip it). */}
            {isLast && layer === "letters" && (
              <Key
                label={<ArrowUp size={20} />}
                onPress={() => setShift((s) => !s)}
                flex={1.6}
                variant={shift ? "active" : "modifier"}
              />
            )}
            {row.map((ch) => (
              <Key
                key={ch}
                label={shift && layer === "letters" ? ch.toUpperCase() : ch}
                onPress={() => pressKey(ch)}
              />
            ))}
            {isLast && (
              <button
                type="button"
                tabIndex={-1}
                onPointerDown={(e) => {
                  e.preventDefault()
                  startHold(onBackspace)
                }}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onMouseDown={(e) => e.preventDefault()}
                style={{ flex: 1.6 }}
                className={cn(
                  "rounded-[6px] font-normal select-none active:opacity-70 transition-opacity",
                  "flex items-center justify-center",
                  "h-[44px] sm:h-[46px]",
                  "bg-[#ADB3BC] text-black text-[18px] dark:bg-[#3C3C3F] dark:text-white",
                )}
                aria-label="Backspace"
              >
                <Delete size={20} />
              </button>
            )}
          </div>
        )
      })}

      {/* Bottom action row: 123 | globe | space | ↵ */}
      <div className="flex gap-[5px]">
        <Key
          label={layer === "letters" ? "123" : "АБВ"}
          onPress={() => setLayer((l) => (l === "letters" ? "symbols" : "letters"))}
          flex={1.6}
          variant="modifier"
        />
        <Key
          label={<Globe size={20} />}
          onPress={() => {
            setLang((l) => (l === "en" ? "ru" : "en"))
            setLayer("letters")
          }}
          flex={1.3}
          variant="modifier"
        />
        {/* Space bar with language hint bottom-right, like iOS. */}
        <button
          type="button"
          tabIndex={-1}
          onPointerDown={(e) => {
            e.preventDefault()
            onInsert(" ")
          }}
          onMouseDown={(e) => e.preventDefault()}
          style={{ flex: 5 }}
          className="relative rounded-[6px] bg-white text-black shadow-sm dark:bg-[#6C6C70] dark:text-white dark:shadow-none h-[44px] sm:h-[46px] active:opacity-70 transition-opacity flex items-center justify-center text-[15px]"
        >
          <span className="opacity-80">{SPACE_LABEL[lang]}</span>
          <span className="absolute right-2 bottom-1 text-[11px] opacity-60">
            {LANG_HINT[lang]}
          </span>
        </button>
        <Key
          label={<span className="text-[20px]">⏎</span>}
          onPress={() => onInsert("\n")}
          flex={1.6}
          variant="modifier"
        />
      </div>
    </div>
  )
}
