"use client"

import { useState, useCallback, useRef, useEffect, useImperativeHandle, type Ref } from "react"
import { createPortal } from "react-dom"
import { ArrowUp, ArrowUpToLine, Delete, Globe, Mic } from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// WhatsApp-styled in-page keyboard for the Inbox composer.
//
// Feature set (15.07 full package):
//   • Long-press alternates with an iOS-style bubble (ь→ъ, е→ё, $→€/₽, "→«»,
//     .→…) — before this, ъ and ё were simply untypeable.
//   • Auto-capitalization: shift arms itself at the start of a message and
//     after ". " / "! " / "? " (the composer reports caret context through
//     the syncContext imperative handle).
//   • Double-tap shift = Caps Lock (tap again to release).
//   • Double-space = ". " (handled in the Composer, which owns the textarea).
//   • Second symbols layer (#+=) with %, *, «», €, ₽ etc.
//   • Keyboard language persists across sessions (localStorage).
//   • Dictation shows the live interim transcript; the mic is hidden entirely
//     when the browser/WebView has no SpeechRecognition.
//
// Remaining tradeoffs vs. the native keyboard (accepted by the owner):
//   • No autocorrect / suggestions
//   • No swipe typing
//
// Performance notes:
//   • KeyButton is a top-level component (not redefined on every render of
//     VirtualKeyboard), so React reconciles by identity and never re-mounts
//     the buttons.
//   • Key presses fire on POINTERDOWN, not click. Saves ~70-150ms of
//     touchend→click latency on iOS. Long-press alternates keep that latency:
//     the main character is inserted on pointerdown as usual and only
//     REPLACED (backspace + insert) if the user commits an alternate.
//   • Backspace auto-repeats while held (initial 400ms delay, then 50ms
//     interval).
// ---------------------------------------------------------------------------

type Lang = "en" | "ru"
type Layer = "letters" | "symbols" | "symbols2"
// off = lowercase, once = capitalize next letter (manual tap OR auto), lock =
// Caps Lock via double-tap.
type ShiftMode = "off" | "once" | "lock"

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

// Layer 1 (123): digits + common punctuation, iOS layout. The third row is
// short — the "#+=" modifier on its left opens layer 2.
const SYMBOLS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""],
  [".", ",", "?", "!", "'"],
]

// Layer 2 (#+=): the missing half — %, *, currency, RU guillemets. Before
// this layer existed staff couldn't type a % discount at all.
const SYMBOLS2: string[][] = [
  ["[", "]", "{", "}", "#", "%", "^", "*", "+", "="],
  ["_", "\\", "|", "~", "<", ">", "€", "₽", "·"],
  [".", ",", "?", "!", "«", "»"],
]

// Long-press alternates (shown in a bubble above the key). Kept deliberately
// short — only what staff actually need. NB: no en/em dash here on purpose,
// client-facing texts must use a plain hyphen (owner rule 14.06).
const ALTERNATES: Record<string, string[]> = {
  "е": ["ё"],
  "ь": ["ъ"],
  "$": ["€", "₽"],
  "\"": ["«", "»"],
  ".": ["…"],
}

const SPACE_LABEL: Record<Lang, string> = { en: "english", ru: "русский" }
const LANG_HINT: Record<Lang, string> = { en: "en", ru: "ру" }
const SPEECH_LANG: Record<Lang, string> = { en: "en-US", ru: "ru-RU" }
const ABC_LABEL: Record<Lang, string> = { en: "ABC", ru: "АБВ" }
// Last picked keyboard language survives restarts — before this the keyboard
// reset to the role default on every app launch.
const LS_LANG_KEY = "bg.kb.lang"

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
  alternates,
  onAlternate,
}: {
  label: React.ReactNode
  onPress: () => void
  flex?: number
  variant?: Variant
  ariaLabel?: string
  /** Long-press bubble characters (already case-transformed by the parent). */
  alternates?: string[]
  /** Commit a bubble pick — the parent replaces the just-typed main char. */
  onAlternate?: (ch: string) => void
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Snapshot of the alternates at press time — the main press may flip shift
  // (one-shot), re-rendering with a different case mid-press.
  const snapRef = useRef<string[]>([])
  // The bubble is PORTALED to <body> and positioned fixed from the key's
  // rect: the keyboard shell clips overflow (drag mechanics) and the inbox
  // container carries a transform, so an in-place absolute bubble would be
  // cut off for top-row keys (е!) — same reason ImageLightbox portals.
  const [popup, setPopup] = useState<{ alts: string[]; x: number; y: number } | null>(null)
  const [sel, setSel] = useState(0)

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  return (
    <button
      ref={btnRef}
      type="button"
      tabIndex={-1}
      onPointerDown={(e) => {
        e.preventDefault()
        buzz(2)
        onPress()
        if (alternates?.length && onAlternate) {
          snapRef.current = alternates
          try {
            btnRef.current?.setPointerCapture(e.pointerId)
          } catch {}
          holdTimer.current = setTimeout(() => {
            const rect = btnRef.current?.getBoundingClientRect()
            if (!rect) return
            setPopup({ alts: snapRef.current, x: rect.left + rect.width / 2, y: rect.top })
            setSel(0)
            buzz(4)
          }, 450)
        }
      }}
      onPointerMove={(e) => {
        if (!popup) return
        const pop = popRef.current
        if (!pop) return
        const rect = pop.getBoundingClientRect()
        // Slide well below the key → cancel the bubble, keep the main char.
        if (e.clientY > rect.bottom + 90) {
          setPopup(null)
          return
        }
        const step = rect.width / popup.alts.length
        const idx = Math.max(0, Math.min(popup.alts.length - 1, Math.floor((e.clientX - rect.left) / step)))
        setSel((prev) => (prev === idx ? prev : idx))
      }}
      onPointerUp={() => {
        clearHold()
        if (popup && onAlternate) {
          onAlternate(popup.alts[sel])
          buzz(2)
        }
        setPopup(null)
      }}
      onPointerCancel={() => {
        clearHold()
        setPopup(null)
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
      {/* iOS-style long-press bubble: a row of alternates above the key. The
          finger slides to pick, release commits. Portaled + fixed so no
          overflow/transform ancestor can clip it. */}
      {popup &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[100] flex rounded-xl bg-white dark:bg-[#3C3C3F] shadow-lg border border-black/10 dark:border-white/10 overflow-hidden pointer-events-none"
            style={{ left: popup.x, top: popup.y - 8, transform: "translate(-50%, -100%)" }}
          >
            {popup.alts.map((ch, i) => (
              <span
                key={ch}
                className={cn(
                  "px-3.5 py-2 text-[22px] leading-none",
                  i === sel ? "bg-brand text-white" : "text-black dark:text-white",
                )}
              >
                {ch}
              </span>
            ))}
          </div>,
          document.body,
        )}
    </button>
  )
}

// ---------------------------------------------------------------------------

/** Imperative handle: the Composer reports the text before the caret after
 *  every mutation so the keyboard can arm auto-capitalization. */
export interface VirtualKeyboardHandle {
  syncContext: (textBeforeCaret: string) => void
}

export interface VirtualKeyboardProps {
  onInsert: (text: string) => void
  onBackspace: () => void
  /** Greyed-out look when the 24h window is closed (free text can't reach the
   *  client — only an approved template can). Stays usable for admins whose
   *  free text is wrapped server-side. */
  inactive?: boolean
  /** Which layout the keyboard opens on when the user has no saved language
   *  yet. Admin defaults to "ru", trainers to "en". The user can still flip
   *  languages with the globe key — the choice is then remembered. */
  defaultLang?: Lang
  ref?: Ref<VirtualKeyboardHandle>
}

export default function VirtualKeyboard({
  onInsert,
  onBackspace,
  inactive = false,
  defaultLang = "ru",
  ref,
}: VirtualKeyboardProps) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(LS_LANG_KEY)
      if (saved === "en" || saved === "ru") return saved
    }
    return defaultLang
  })
  const [layer, setLayer] = useState<Layer>("letters")
  // A new message starts with a capital — shift is pre-armed on mount.
  const [shift, setShift] = useState<ShiftMode>("once")
  const [dictating, setDictating] = useState(false)
  // Live in-progress transcript so the user SEES dictation working (it used
  // to be collected and silently dropped).
  const [interim, setInterim] = useState("")
  // Detected once: no SpeechRecognition (e.g. some WebViews) → no mic button
  // at all, instead of an alert() on tap.
  const [speechSupported] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
  })
  // Double-tap window for Caps Lock.
  const lastShiftTapRef = useRef(0)
  // Rising-edge tracker for auto-capitalization: we arm shift only when the
  // caret ENTERS a sentence-start context, so a user who manually lowered
  // shift isn't fought every keystroke.
  const ctxTriggerRef = useRef(true)

  const shifted = shift !== "off"

  useImperativeHandle(ref, () => ({
    syncContext(before: string) {
      const trigger =
        before.length === 0 || /[.!?…]\s+$/.test(before) || /\n$/.test(before)
      if (trigger && !ctxTriggerRef.current) {
        setShift((m) => (m === "off" ? "once" : m))
      }
      ctxTriggerRef.current = trigger
    },
  }), [])

  const rows: string[][] =
    layer === "letters" ? (lang === "ru" ? LETTERS_RU : LETTERS_EN)
    : layer === "symbols" ? SYMBOLS
    : SYMBOLS2

  const pressKey = useCallback(
    (ch: string) => {
      onInsert(shifted && layer === "letters" ? ch.toUpperCase() : ch)
      if (shift === "once") setShift("off") // one-shot shift, iOS-style
    },
    [onInsert, shift, shifted, layer],
  )

  // Long-press bubble commit: the main char went in on pointerdown — swap it.
  const replaceWithAlternate = useCallback(
    (ch: string) => {
      onBackspace()
      onInsert(ch)
    },
    [onBackspace, onInsert],
  )

  // Case-transform the bubble to match what the main press produced.
  const altFor = useCallback(
    (ch: string): string[] | undefined => {
      const alts = ALTERNATES[ch]
      if (!alts) return undefined
      return shifted && layer === "letters" ? alts.map((a) => a.toUpperCase()) : alts
    },
    [shifted, layer],
  )

  // Shift: tap toggles once/off, double-tap (<350ms) = Caps Lock, any tap
  // releases a lock.
  const tapShift = useCallback(() => {
    buzz(2)
    const now = Date.now()
    if (now - lastShiftTapRef.current < 350 && shift !== "lock") {
      setShift("lock")
    } else {
      setShift((m) => (m === "off" ? "once" : "off"))
    }
    lastShiftTapRef.current = now
  }, [shift])

  const toggleLang = useCallback(() => {
    setLang((l) => {
      const next = l === "en" ? "ru" : "en"
      try {
        window.localStorage.setItem(LS_LANG_KEY, next)
      } catch {}
      return next
    })
    setLayer("letters")
  }, [])

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
  const recognitionRef = useRef<InstanceType<SRType> | null>(null)

  const stopDictation = useCallback(() => {
    const rec = recognitionRef.current
    if (rec) {
      try {
        rec.stop()
      } catch {}
    }
    recognitionRef.current = null
    setDictating(false)
    setInterim("")
  }, [])

  const startDictation = useCallback(() => {
    if (typeof window === "undefined") return
    const SR = (window as unknown as { SpeechRecognition?: SRType; webkitSpeechRecognition?: SRType })
      .SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: SRType; webkitSpeechRecognition?: SRType })
        .webkitSpeechRecognition
    if (!SR) return // mic button isn't rendered in this case
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = SPEECH_LANG[lang]
    let lastFinalText = ""
    rec.onresult = (e) => {
      // Build the final text from results that are marked as final, and a
      // separate interim string for the in-progress chunk. We commit each
      // final chunk to the textarea once; the interim chunk is shown live in
      // the strip above the keys.
      let finalChunk = ""
      let interimChunk = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          finalChunk += r[0].transcript
        } else {
          interimChunk += r[0].transcript
        }
      }
      if (finalChunk && finalChunk !== lastFinalText) {
        // Insert just the new final piece plus a trailing space.
        const newText = finalChunk.slice(lastFinalText.length)
        if (newText) onInsert(newText + " ")
        lastFinalText = finalChunk
      }
      setInterim(interimChunk)
    }
    rec.onerror = (event) => {
      console.warn("[VirtualKeyboard] dictation error:", event.error)
      stopDictation()
    }
    rec.onend = () => {
      // Sometimes Safari ends the recognition before the user taps stop
      // (e.g. after a long silence). Reflect that in the UI.
      setDictating(false)
      setInterim("")
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
        // Muted but USABLE when the 24h window is closed: staff free text is
        // wrapped in the approved admin_message template server-side (owner
        // 04.07), so the keys must stay pressable. The old pointer-events-none
        // contradicted that - the field said "sent as a template" while the
        // keyboard silently ignored taps.
        inactive && "opacity-70",
      )}
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
    >
      {/* Live dictation strip: red pulse + the in-progress transcript, so the
          user sees words landing instead of talking into a void. */}
      {dictating && (
        <div className="mx-0.5 mb-1.5 px-3 py-1.5 rounded-lg bg-white/80 dark:bg-white/10 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-[13px] text-gray-700 dark:text-gray-200 truncate">
            {interim || (lang === "ru" ? "Говорите, я слушаю" : "Listening")}
          </span>
        </div>
      )}

      {/* Letter / symbol rows */}
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1
        return (
          <div key={`${layer}-${i}`} className="flex gap-[5px] mb-[6px]">
            {/* Left modifier of the last row: Shift (letters), #+= (symbols),
                123 (symbols2). */}
            {isLast && layer === "letters" && (
              <KeyButton
                label={shift === "lock" ? <ArrowUpToLine size={20} /> : <ArrowUp size={20} />}
                onPress={tapShift}
                flex={1.6}
                variant={shifted ? "active" : "modifier"}
                ariaLabel={shift === "lock" ? "Caps Lock on" : "Shift"}
              />
            )}
            {isLast && layer === "symbols" && (
              <KeyButton
                label="#+="
                onPress={() => setLayer("symbols2")}
                flex={1.6}
                variant="modifier"
                ariaLabel="More symbols"
              />
            )}
            {isLast && layer === "symbols2" && (
              <KeyButton
                label="123"
                onPress={() => setLayer("symbols")}
                flex={1.6}
                variant="modifier"
                ariaLabel="Numbers"
              />
            )}
            {row.map((ch) => (
              <KeyButton
                key={ch}
                label={shifted && layer === "letters" ? ch.toUpperCase() : ch}
                onPress={() => pressKey(ch)}
                alternates={altFor(ch)}
                onAlternate={replaceWithAlternate}
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

      {/* Bottom action row: 123/АБВ | globe | space | mic | ↵ */}
      <div className="flex gap-[5px]">
        <KeyButton
          label={layer === "letters" ? "123" : ABC_LABEL[lang]}
          onPress={() => setLayer((l) => (l === "letters" ? "symbols" : "letters"))}
          flex={1.6}
          variant="modifier"
        />
        <KeyButton
          label={<Globe size={20} />}
          onPress={toggleLang}
          flex={1.3}
          variant="modifier"
          ariaLabel="Change language"
        />
        {/* Space bar with language hint bottom-right, like iOS. Double-space
            = ". " lives in the Composer (it owns the textarea). */}
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
        {/* Mic dictation button — only when the environment actually supports
            the Web Speech API; toggles between idle and recording. */}
        {speechSupported && (
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
        )}
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
