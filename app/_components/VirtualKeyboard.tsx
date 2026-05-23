"use client"

import { useState, useCallback } from "react"
import { ArrowUp, ChevronUp, Delete, Globe, Send } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Lightweight in-page keyboard for the WhatsApp inbox composer.
//
// Why: on iOS Safari the native soft keyboard caused weeks of headaches with
// modal positioning (visualViewport jumps, sticky elements drifting, etc.).
// Using a virtual keyboard means the OS keyboard never appears, so the
// modal never gets resized and we never have to chase iOS' auto-scroll.
//
// Scope intentionally kept tight:
//   • English QWERTY + Russian ЙЦУКЕН + numbers/symbols layer
//   • Shift for one-shot uppercase
//   • Backspace, Space, newline, language switch, Send
//   • Append/delete at the END of the input (no caret manipulation)
//
// Trade-offs vs. native keyboard the user explicitly accepted:
//   • No autocorrect / suggestions / dictation / emoji picker / swipe typing
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
  ["-", "/", ":", ";", "(", ")", "₽", "&", "@", "\""],
  [".", ",", "?", "!", "'", "*", "+", "="],
]

export interface VirtualKeyboardProps {
  /** Append one or more characters to the input. */
  onInsert: (text: string) => void
  /** Remove the last character. */
  onBackspace: () => void
  /** Send the current message. Called from the green Send button. */
  onSend: () => void
  /** Disable Send when there's nothing to send. */
  canSend: boolean
}

export default function VirtualKeyboard({
  onInsert,
  onBackspace,
  onSend,
  canSend,
}: VirtualKeyboardProps) {
  const [lang, setLang] = useState<Lang>("ru")
  const [layer, setLayer] = useState<Layer>("letters")
  const [shift, setShift] = useState(false)

  const rows: string[][] =
    layer === "symbols" ? SYMBOLS : lang === "ru" ? LETTERS_RU : LETTERS_EN

  const pressKey = useCallback(
    (ch: string) => {
      onInsert(shift ? ch.toUpperCase() : ch)
      if (shift) setShift(false) // one-shot shift like iOS
    },
    [onInsert, shift],
  )

  // Prevent the textarea from losing focus when a key is pressed.
  // mousedown on a button by default moves focus to the button; we cancel
  // that, then the click handler still fires and inserts the character.
  const noFocusSteal = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault()
  }

  const Key = ({
    label,
    onPress,
    flex = 1,
    variant = "default",
    disabled = false,
  }: {
    label: React.ReactNode
    onPress: () => void
    flex?: number
    variant?: "default" | "modifier" | "send" | "active"
    disabled?: boolean
  }) => (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={noFocusSteal}
      onPointerDown={noFocusSteal}
      onClick={onPress}
      disabled={disabled}
      style={{ flex }}
      className={cn(
        "h-10 sm:h-11 rounded-lg text-base font-medium transition-colors active:scale-95 select-none",
        "flex items-center justify-center",
        variant === "default" && "bg-white text-gray-800 shadow-sm hover:bg-gray-50",
        variant === "modifier" && "bg-gray-300 text-gray-800 shadow-sm hover:bg-gray-400",
        variant === "active" && "bg-[#2C6E49] text-white shadow",
        variant === "send" &&
          "bg-[#2C6E49] text-white shadow disabled:bg-gray-200 disabled:text-gray-400",
      )}
    >
      {label}
    </button>
  )

  return (
    <div
      className="bg-gray-200 px-1.5 pt-1.5 pb-2 select-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
    >
      {/* Letter / symbol rows */}
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1
        return (
          <div key={i} className="flex gap-1.5 mb-1.5">
            {/* Last letter row gets Shift on the left + Backspace on the right */}
            {isLast && layer === "letters" && (
              <Key
                label={<ArrowUp size={16} />}
                onPress={() => setShift((s) => !s)}
                flex={1.5}
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
              <Key
                label={<Delete size={16} />}
                onPress={onBackspace}
                flex={1.5}
                variant="modifier"
              />
            )}
          </div>
        )
      })}

      {/* Bottom action row */}
      <div className="flex gap-1.5">
        <Key
          label={layer === "letters" ? "123" : "АБВ"}
          onPress={() => setLayer((l) => (l === "letters" ? "symbols" : "letters"))}
          flex={1.5}
          variant="modifier"
        />
        <Key
          label={<Globe size={16} />}
          onPress={() => {
            setLang((l) => (l === "en" ? "ru" : "en"))
            setLayer("letters")
          }}
          flex={1.2}
          variant="modifier"
        />
        <Key
          label={lang === "ru" ? "пробел" : "space"}
          onPress={() => onInsert(" ")}
          flex={5}
        />
        <Key label="↵" onPress={() => onInsert("\n")} flex={1.2} variant="modifier" />
        <Key
          label={<Send size={16} />}
          onPress={onSend}
          flex={1.5}
          variant="send"
          disabled={!canSend}
        />
      </div>
    </div>
  )
}
