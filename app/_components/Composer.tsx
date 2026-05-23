"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Loader2, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import VirtualKeyboard from "@/app/_components/VirtualKeyboard"

// ---------------------------------------------------------------------------
// Inbox composer (pill input + virtual keyboard).
//
// Performance note: the textarea is *uncontrolled* — its value lives in the
// DOM, not in React state. Every key press is a single DOM mutation, which
// is much faster than the previous setText(...) approach that re-rendered
// the whole Inbox (chat list + thread + composer) on every character.
//
// React state is only used for two boolean flags (hasText, sending) which
// toggle a handful of times per send cycle, so virtual-keyboard input feels
// instant even when typing very fast or holding backspace.
// ---------------------------------------------------------------------------

export interface ComposerProps {
  /** Called when the Send button (or programmatic send) fires with non-empty text. */
  onSend: (text: string) => Promise<void> | void
  /** Called when the user picks a photo/video via the "+" button. */
  onAttach?: (file: File) => Promise<void> | void
  /** Current font scale for the composer text and 3-line cap calculations. */
  fontScale: number
}

export default function Composer({ onSend, onAttach, fontScale }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [hasText, setHasText] = useState(false)
  const [sending, setSending] = useState(false)

  // Recompute the textarea's height (up to 3 lines, then internal scroll).
  // Read-then-write in the same task to avoid layout thrashing.
  const updateHeight = useCallback(() => {
    const t = textareaRef.current
    if (!t) return
    t.style.height = "auto"
    const style = window.getComputedStyle(t)
    const lineHeight = parseFloat(style.lineHeight) || 20
    const paddingTop = parseFloat(style.paddingTop) || 0
    const paddingBottom = parseFloat(style.paddingBottom) || 0
    const borderTop = parseFloat(style.borderTopWidth) || 0
    const borderBottom = parseFloat(style.borderBottomWidth) || 0
    const maxH = lineHeight * 3 + paddingTop + paddingBottom + borderTop + borderBottom
    const naturalH = t.scrollHeight
    t.style.height = Math.min(naturalH, maxH) + "px"
    if (naturalH > maxH) t.scrollTop = t.scrollHeight
  }, [])

  // Recompute height when font scale changes (line-height tracks font-size).
  useLayoutEffect(() => {
    updateHeight()
  }, [fontScale, updateHeight])

  // Helper: update hasText flag if the empty/non-empty state actually changed.
  // We deliberately do NOT call setState on every character because hasText
  // would only flip true/false a handful of times — most keystrokes leave the
  // value already non-empty, so this avoids an unnecessary React render.
  const syncHasText = useCallback(() => {
    const t = textareaRef.current
    if (!t) return
    const next = t.value.trim().length > 0
    setHasText((prev) => (prev === next ? prev : next))
  }, [])

  // VirtualKeyboard → insert one or more characters at the end.
  const insertText = useCallback(
    (ch: string) => {
      const t = textareaRef.current
      if (!t) return
      // Direct DOM write — no React state change, no re-render.
      t.value += ch
      updateHeight()
      syncHasText()
    },
    [updateHeight, syncHasText],
  )

  // VirtualKeyboard → backspace last character.
  const backspace = useCallback(() => {
    const t = textareaRef.current
    if (!t) return
    if (t.value.length === 0) return
    t.value = t.value.slice(0, -1)
    updateHeight()
    syncHasText()
  }, [updateHeight, syncHasText])

  // Send: read value from DOM, clear, call back. Optimistic UI lives in the
  // parent (Inbox.send) — we just hand it the text and reset locally.
  const send = useCallback(async () => {
    const t = textareaRef.current
    if (!t || sending) return
    const draft = t.value.trim()
    if (!draft.length) return
    // Reset the field immediately so it feels instant.
    t.value = ""
    updateHeight()
    setHasText(false)
    setSending(true)
    try {
      await onSend(draft)
    } catch {
      // onSend manages its own error UI; we just unlock the button.
    } finally {
      setSending(false)
      // Re-focus the textarea so the caret keeps blinking.
      textareaRef.current?.focus({ preventScroll: true })
    }
  }, [onSend, sending, updateHeight])

  // Initial focus + keep caret blinking when focus is lost to body.
  useEffect(() => {
    const t = textareaRef.current
    if (!t) return
    t.focus()
  }, [])

  return (
    <>
      <div
        className="px-2 pt-2 bg-[#ECE5DD] dark:bg-[#0B141A]"
        style={{ paddingBottom: 6 }}
      >
        <div className="flex gap-2 items-end">
          {/* "+" attachment button — opens the native picker. We deliberately
              fire on `click` (not pointerdown) because the file input dialog
              must be invoked from a user-initiated click for iOS to allow it. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f && onAttach) {
                void onAttach(f)
              }
              // Reset so picking the same file twice still fires onChange.
              e.target.value = ""
            }}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => fileInputRef.current?.click()}
            disabled={!onAttach}
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 dark:text-[#8696A0] flex-shrink-0 disabled:opacity-40 active:opacity-60"
            aria-label="Attach photo or video"
          >
            <span className="text-2xl leading-none">+</span>
          </button>

          {/* Pill input with the textarea inside. */}
          <div className="flex-1 min-w-0 flex items-end bg-white dark:bg-[#1F2C34] rounded-3xl px-4 py-1 shadow-sm">
            <textarea
              ref={textareaRef}
              defaultValue=""
              onInput={() => {
                updateHeight()
                syncHasText()
              }}
              onBlur={() => {
                requestAnimationFrame(() => {
                  const active = document.activeElement
                  if (
                    textareaRef.current &&
                    (active === document.body || active === null)
                  ) {
                    textareaRef.current.focus({ preventScroll: true })
                  }
                })
              }}
              inputMode="none"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Сообщение"
              disabled={sending}
              rows={1}
              className="flex-1 resize-none overflow-y-auto leading-snug bg-transparent border-0 outline-none focus:outline-none focus:ring-0 py-1.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#8696A0] disabled:text-gray-400 dark:disabled:text-[#5C6970]"
              style={{ fontSize: `${fontScale * 0.95}rem` }}
            />
          </div>

          {/* Send button: white circle with up-arrow icon, matches WhatsApp. */}
          <button
            onClick={send}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => e.preventDefault()}
            disabled={sending || !hasText}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-colors flex-shrink-0",
              "bg-white text-[#1F2C34] dark:bg-white dark:text-[#1F2C34]",
              "disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-[#2A3942] dark:disabled:text-[#5C6970]",
            )}
            aria-label="Send"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      <VirtualKeyboard onInsert={insertText} onBackspace={backspace} />
    </>
  )
}
