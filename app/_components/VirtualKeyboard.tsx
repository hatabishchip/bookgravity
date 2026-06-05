"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { ArrowUp, Delete, Globe, Mic } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// WhatsApp-styled in-page keyboard for the Inbox composer.
//
// Tradeoffs accepted by the user vs. native keyboard:
//   • No autocorrect / suggestions
//   • No emoji picker
//   • No swipe typing
// Native dictation is exposed via the mic button next to Return — it uses
// the Web Speech API (webkitSpeechRecognition on iOS Safari, SpeechRecognition
// on Chrome Android).
//
// Performance notes:
//   • KeyButton is a top-level component (not redefined on every render of
//     VirtualKeyboard), so React reconciles by identity and never re-mounts
//     the buttons.
//   • Key presses fire on POINTERDOWN, not click. Saves ~70-150ms of
//     touchend→click latency on iOS.
//   • Backspace auto-repeats while held (initial 400ms delay, then 50ms
//     interval).
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
const SPEECH_LANG: Record<Lang, string> = { en: "en-US", ru: "ru-RU" }

// Tiny haptic ping on every keypress. iOS Safari ignores this entirely
// (no Web Vibration API there), but Android Chrome and PWAs respect it
// and we get a single-cycle (2ms) buzz that reads as a tap.
function buzz(ms = 2) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(ms)
    } catch {
      // some browsers reject vibrate without a user gesture context;
      // pointerdown is fine but the throw still happens occasionally.
    }
  }
}

// ---------------------------------------------------------------------------
// Top-level button so React doesn't re-create a new function component on
// every parent render — without this, every keystroke unmounted+remounted
// 30+ buttons.
// ---------------------------------------------------------------------------
type Variant = "letter" | "modifier" | "active" | "space"

function KeyButton({
  label,
  onPress,
  flex = 1,
  variant = "letter",
  ariaLabel,
}: {
  label: React.ReactNode
  onPress: () => void
  flex?: number
  variant?: Variant
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onPointerDown={(e) => {
        e.preventDefault()
        buzz(2)
        onPress()
      }}
      onMouseDown={(e) => e.preventDefault()}
      style={{ flex }}
      aria-label={ariaLabel}
      className={cn(
        "rounded-[6px] font-normal select-none transition-[transform,opacity] duration-75 active:scale-[0.92] active:opacity-80",
        "flex items-center justify-center",
        "h-[44px] sm:h-[46px]",
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
}

// ---------------------------------------------------------------------------

export interface VirtualKeyboardProps {
  onInsert: (text: string) => void
  onBackspace: () => void
  /** Greyed-out look when the 24h window is closed (free text can't reach the
   *  client — only an approved template can). Stays usable for admins whose
   *  free text is wrapped server-side. */
  inactive?: boolean
  /** Which layout the keyboard opens on. Admin defaults to "ru", trainers to
   *  "en". The user can still flip languages with the globe key. */
  defaultLang?: Lang
}

export default function VirtualKeyboard({
  onInsert,
  onBackspace,
  inactive = false,
  defaultLang = "ru",
}: VirtualKeyboardProps) {
  const [lang, setLang] = useState<Lang>(defaultLang)
  const [layer, setLayer] = useState<Layer>("letters")
  const [shift, setShift] = useState(false)
  const [dictating, setDictating] = useState(false)

  const rows: string[][] =
    layer === "symbols" ? SYMBOLS : lang === "ru" ? LETTERS_RU : LETTERS_EN

  const pressKey = useCallback(
    (ch: string) => {
      onInsert(shift && layer === "letters" ? ch.toUpperCase() : ch)
      if (shift) setShift(false) // one-shot shift, iOS-style
    },
    [onInsert, shift, layer],
  )

  // Press-and-hold for Backspace: first fire immediately, then after a
  // 400ms initial delay tick every 50ms.
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
  const startHoldBackspace = useCallback(() => {
    buzz(2)
    onBackspace()
    holdTimers.current.initial = setTimeout(() => {
      holdTimers.current.tick = setInterval(onBackspace, 50)
    }, 400)
  }, [onBackspace])
  useEffect(() => () => stopHold(), [stopHold])

  // ----------------- Voice dictation (Web Speech API) -----------------
  // Lazily-typed reference to the SpeechRecognition object. We don't keep
  // the class itself in state — just the active instance — so we can stop
  // mid-utterance if the user taps the mic again.
  type SRType = {
    new (): {
      continuous: boolean
      interimResults: boolean
      lang: string
      start: () => void
      stop: () => void
      onresult: ((e: SpeechRecognitionEventLike) => void) | null
      onerror: ((e: { error: string }) => void) | null
      onend: (() => void) | null
    }
  }
  type SpeechRecognitionEventLike = {
    results: ArrayLike<{
      isFinal: boolean
      0: { transcript: string }
    }>
    resultIndex: number
  }
  const recognitionRef = useRef<ReturnType<SRType["prototype"]["start"]> extends void ? InstanceType<SRType> | null : null>(null) as React.MutableRefObject<InstanceType<SRType> | null>
  const lastInterimRef = useRef<string>("")

  const stopDictation = useCallback(() => {
    const rec = recognitionRef.current
    if (rec) {
      try {
        rec.stop()
      } catch {}
    }
    recognitionRef.current = null
    setDictating(false)
    lastInterimRef.current = ""
  }, [])

  const startDictation = useCallback(() => {
    if (typeof window === "undefined") return
    const SR = (window as unknown as { SpeechRecognition?: SRType; webkitSpeechRecognition?: SRType })
      .SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: SRType; webkitSpeechRecognition?: SRType })
        .webkitSpeechRecognition
    if (!SR) {
      alert("Voice input isn't supported by this browser.")
      return
    }
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = SPEECH_LANG[lang]
    let lastFinalText = ""
    rec.onresult = (e) => {
      // Build the final text from results that are marked as final, and a
      // separate interim string for the in-progress chunk. We commit each
      // final chunk to the textarea once.
      let finalChunk = ""
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          finalChunk += r[0].transcript
        } else {
          interim += r[0].transcript
        }
      }
      if (finalChunk && finalChunk !== lastFinalText) {
        // Insert just the new final piece plus a trailing space.
        const newText = finalChunk.slice(lastFinalText.length)
        if (newText) onInsert(newText + " ")
        lastFinalText = finalChunk
      }
      lastInterimRef.current = interim
    }
    rec.onerror = (event) => {
      console.warn("[VirtualKeyboard] dictation error:", event.error)
      stopDictation()
    }
    rec.onend = () => {
      // Sometimes Safari ends the recognition before the user taps stop
      // (e.g. after a long silence). Reflect that in the UI.
      setDictating(false)
      recognitionRef.current = null
    }
    try {
      rec.start()
      recognitionRef.current = rec
      setDictating(true)
    } catch (err) {
      console.warn("[VirtualKeyboard] failed to start dictation:", err)
      stopDictation()
    }
  }, [lang, onInsert, stopDictation])

  useEffect(() => {
    // Clean up if the keyboard unmounts mid-dictation.
    return () => stopDictation()
  }, [stopDictation])

  return (
    <div
      className={cn(
        "bg-[#D1D5DB] dark:bg-[#1F1F22] px-1 pt-2 pb-1.5 select-none transition-opacity",
        inactive && "opacity-50",
      )}
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
    >
      {/* Letter / symbol rows */}
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1
        return (
          <div key={i} className="flex gap-[5px] mb-[6px]">
            {/* Shift on the left of the last letter row. */}
            {isLast && layer === "letters" && (
              <KeyButton
                label={<ArrowUp size={20} />}
                onPress={() => {
                  buzz(2)
                  setShift((s) => !s)
                }}
                flex={1.6}
                variant={shift ? "active" : "modifier"}
                ariaLabel="Shift"
              />
            )}
            {row.map((ch) => (
              <KeyButton
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
                  startHoldBackspace()
                }}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onMouseDown={(e) => e.preventDefault()}
                style={{ flex: 1.6 }}
                className={cn(
                  "rounded-[6px] font-normal select-none transition-[transform,opacity] duration-75 active:scale-[0.92] active:opacity-80",
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

      {/* Bottom action row: 123 | globe | space | mic | ↵ */}
      <div className="flex gap-[5px]">
        <KeyButton
          label={layer === "letters" ? "123" : "АБВ"}
          onPress={() => setLayer((l) => (l === "letters" ? "symbols" : "letters"))}
          flex={1.6}
          variant="modifier"
        />
        <KeyButton
          label={<Globe size={20} />}
          onPress={() => {
            setLang((l) => (l === "en" ? "ru" : "en"))
            setLayer("letters")
          }}
          flex={1.3}
          variant="modifier"
          ariaLabel="Change language"
        />
        {/* Space bar with language hint bottom-right, like iOS. */}
        <button
          type="button"
          tabIndex={-1}
          onPointerDown={(e) => {
            e.preventDefault()
            buzz(2)
            onInsert(" ")
          }}
          onMouseDown={(e) => e.preventDefault()}
          style={{ flex: 5 }}
          className="relative rounded-[6px] bg-white text-black shadow-sm dark:bg-[#6C6C70] dark:text-white dark:shadow-none h-[44px] sm:h-[46px] active:scale-[0.96] active:opacity-80 transition-[transform,opacity] duration-75 flex items-center justify-center text-[15px]"
        >
          <span className="opacity-80">{SPACE_LABEL[lang]}</span>
          <span className="absolute right-2 bottom-1 text-[11px] opacity-60">
            {LANG_HINT[lang]}
          </span>
        </button>
        {/* Mic dictation button — toggles between idle and recording. */}
        <KeyButton
          label={<Mic size={18} />}
          onPress={() => {
            buzz(4)
            if (dictating) stopDictation()
            else startDictation()
          }}
          flex={1.3}
          variant={dictating ? "active" : "modifier"}
          ariaLabel={dictating ? "Stop dictation" : "Start dictation"}
        />
        <KeyButton
          label={<span className="text-[20px]">⏎</span>}
          onPress={() => onInsert("\n")}
          flex={1.6}
          variant="modifier"
          ariaLabel="New line"
        />
      </div>
    </div>
  )
}
