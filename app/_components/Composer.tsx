"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Keyboard, Loader2, Send, Smile, MessageSquareText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import VirtualKeyboard from "@/app/_components/VirtualKeyboard"
import StickerPicker from "@/app/_components/StickerPicker"

// ---------------------------------------------------------------------------
// Quick reply templates (English). These are Meta-APPROVED WhatsApp message
// templates, so picking one sends it via the template path — which works even
// when the 24h customer-service window is closed (the client hasn't written in
// 24h). The 7 "reschedule to today" variants all map onto the single approved
// `reschedule_today` template via its {{1}} time variable.
// ---------------------------------------------------------------------------
const TEMPLATE_TIMES = ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00"]

type TemplateDef = {
  label: string
  /** Human-readable text shown in the popover + stored as the chat bubble. */
  text: string
  /** Approved Meta template name. */
  templateName: string
  /** Positional values for the template's {{1}}, {{2}}, … variables. */
  variables?: string[]
}

const MESSAGE_TEMPLATES: TemplateDef[] = [
  ...TEMPLATE_TIMES.map((t) => ({
    label: `Reschedule to today — ${t}`,
    text: `Hello! Would it be convenient to reschedule you to today at ${t}?`,
    templateName: "reschedule_today",
    variables: [t],
  })),
  {
    label: "Reschedule to another day",
    text: "Hello! Would it be convenient to reschedule you to another day? Today's group didn't reach more than 2 people.",
    templateName: "reschedule_other_day",
  },
  {
    label: "Confirm booking",
    text: "Hello! Please confirm your booking for the Gravity Stretching group class.",
    templateName: "confirm_group_booking",
  },
]

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
  /** Called when the user picks a photo/video via the "+" button OR sends a
   *  sticker from the picker. Both go through the same media route. */
  onAttach?: (file: File) => Promise<void> | void
  /** Current font scale for the composer text and 3-line cap calculations. */
  fontScale: number
  /** Which user role is viewing — trainers don't get the photo/video "+"
   *  button (admin-only feature), but they still get the sticker picker. */
  role: "ADMIN" | "TRAINER"
  /** Send a Meta-approved template (works outside the 24h window). When
   *  provided, picking a quick-reply template sends it via this path instead
   *  of filling the text input. */
  onSendTemplate?: (t: {
    templateName: string
    languageCode?: string
    variables?: string[]
    display?: string
  }) => Promise<void> | void
}

export default function Composer({ onSend, onAttach, fontScale, role, onSendTemplate }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [hasText, setHasText] = useState(false)
  const [sending, setSending] = useState(false)
  // Bottom panel mode — either the typing keyboard or the sticker picker.
  const [bottomPanel, setBottomPanel] = useState<"keyboard" | "stickers">("keyboard")
  // Quick-reply templates popover.
  const [showTemplates, setShowTemplates] = useState(false)

  // Recompute the textarea's height (up to 3 lines, then internal scroll).
  // Read-then-write in the same task to avoid layout thrashing. Coalesced
  // through requestAnimationFrame so a burst of keystrokes only triggers
  // one layout pass per frame, not one per character.
  const heightRafRef = useRef<number | null>(null)
  const updateHeightNow = useCallback(() => {
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
  const updateHeight = useCallback(() => {
    if (heightRafRef.current != null) return
    heightRafRef.current = requestAnimationFrame(() => {
      heightRafRef.current = null
      updateHeightNow()
    })
  }, [updateHeightNow])

  // Recompute height when font scale changes (line-height tracks font-size).
  useLayoutEffect(() => {
    updateHeightNow()
  }, [fontScale, updateHeightNow])

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

  // VirtualKeyboard → insert characters at the current caret position
  // (or replace the current selection). Falls back to "append at end" when
  // the textarea has never been focused (selectionStart is null).
  const insertText = useCallback(
    (ch: string) => {
      const t = textareaRef.current
      if (!t) return
      const value = t.value
      const hasSelection = t.selectionStart !== null && t.selectionEnd !== null
      const start = hasSelection ? (t.selectionStart as number) : value.length
      const end = hasSelection ? (t.selectionEnd as number) : value.length
      t.value = value.slice(0, start) + ch + value.slice(end)
      const next = start + ch.length
      try {
        t.setSelectionRange(next, next)
      } catch {
        // Some browsers throw if the textarea is detached; ignore.
      }
      updateHeight()
      syncHasText()
    },
    [updateHeight, syncHasText],
  )

  // VirtualKeyboard → backspace. If the user has a selection (e.g. they
  // long-pressed and "Select All"), delete the selection wholesale.
  // Otherwise delete the single character before the caret.
  const backspace = useCallback(() => {
    const t = textareaRef.current
    if (!t) return
    const value = t.value
    if (value.length === 0) return
    const hasSelection = t.selectionStart !== null && t.selectionEnd !== null
    const start = hasSelection ? (t.selectionStart as number) : value.length
    const end = hasSelection ? (t.selectionEnd as number) : value.length
    if (start !== end) {
      // Selection mode — drop everything between start and end.
      t.value = value.slice(0, start) + value.slice(end)
      try {
        t.setSelectionRange(start, start)
      } catch {}
    } else if (start > 0) {
      // No selection — delete one character before the caret.
      t.value = value.slice(0, start - 1) + value.slice(start)
      const prev = start - 1
      try {
        t.setSelectionRange(prev, prev)
      } catch {}
    } else {
      // Caret at the very start with nothing selected → nothing to delete.
      return
    }
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

  // Quick-reply template: drop the chosen text into the input so the admin can
  // review/edit, then close the popover and re-focus the field.
  const applyTemplate = useCallback(
    (text: string) => {
      const t = textareaRef.current
      if (!t) return
      t.value = text
      updateHeight()
      syncHasText()
      setShowTemplates(false)
      try {
        t.setSelectionRange(text.length, text.length)
      } catch {}
      t.focus({ preventScroll: true })
    },
    [updateHeight, syncHasText],
  )

  // Initial focus + keep caret blinking when focus is lost to body.
  useEffect(() => {
    const t = textareaRef.current
    if (!t) return
    t.focus()
  }, [])

  return (
    <>
      <div
        className="px-2 pt-2 bg-[#ECE5DD] dark:bg-[#0B141A] relative"
        style={{ paddingBottom: 6 }}
      >
        {/* Quick-reply templates popover — anchored above the composer row. */}
        {showTemplates && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setShowTemplates(false)}
            />
            <div className="absolute bottom-full left-2 right-2 mb-2 z-40 max-h-72 overflow-y-auto rounded-2xl bg-white dark:bg-[#1F2C34] shadow-xl border border-gray-200 dark:border-[#2A3942] overscroll-contain">
              <div className="sticky top-0 flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#1F2C34] border-b border-gray-100 dark:border-[#2A3942]">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-[#8696A0]">
                  Templates
                </span>
                <button
                  type="button"
                  onClick={() => setShowTemplates(false)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-white"
                  aria-label="Close templates"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="py-1">
                {MESSAGE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => {
                      if (onSendTemplate) {
                        // Approved template → send straight away (works even
                        // outside the 24h window). Templates can't be edited
                        // before sending, so there's nothing to review.
                        void onSendTemplate({
                          templateName: tpl.templateName,
                          languageCode: "en",
                          variables: tpl.variables,
                          display: tpl.text,
                        })
                        setShowTemplates(false)
                      } else {
                        // No template sender wired → fall back to filling the
                        // input so the user can still send it as free text.
                        applyTemplate(tpl.text)
                      }
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-[#2A3942] active:bg-gray-100 dark:active:bg-[#33444E] transition-colors"
                  >
                    <div className="text-xs font-semibold text-[#2C6E49] dark:text-[#69B58F]">
                      {tpl.label}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-[#C8D0D4] mt-0.5 line-clamp-2">
                      {tpl.text}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="flex gap-2 items-end">
          {/* "+" attachment button — opens the native picker. We deliberately
              fire on `click` (not pointerdown) because the file input dialog
              must be invoked from a user-initiated click for iOS to allow it. */}
          {/* Attachment "+" — admin only. Trainers don't need it (and the
              extra button just steals horizontal space from the input). */}
          {role === "ADMIN" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,image/webp"
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
            </>
          )}
          {/* Sticker / keyboard toggle. The icon flips depending on which
              panel is currently shown below, mirroring WhatsApp. */}
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() =>
              setBottomPanel((m) => (m === "keyboard" ? "stickers" : "keyboard"))
            }
            disabled={!onAttach}
            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 dark:text-[#8696A0] flex-shrink-0 disabled:opacity-40 active:opacity-60"
            aria-label={bottomPanel === "keyboard" ? "Open stickers" : "Open keyboard"}
          >
            {bottomPanel === "keyboard" ? <Smile size={22} /> : <Keyboard size={22} />}
          </button>

          {/* Quick-reply templates toggle. */}
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setShowTemplates((v) => !v)}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-60",
              showTemplates
                ? "text-[#2C6E49] dark:text-[#69B58F]"
                : "text-gray-600 dark:text-[#8696A0]",
            )}
            aria-label="Message templates"
          >
            <MessageSquareText size={21} />
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
              placeholder="Message"
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

      {bottomPanel === "keyboard" ? (
        <VirtualKeyboard onInsert={insertText} onBackspace={backspace} />
      ) : (
        <StickerPicker
          onPick={(emoji) => {
            // Insert the emoji character at the caret instead of sending
            // it as a standalone sticker — so users can mix emoji with
            // text: "Спасибо за бронь 🙏 жду тебя завтра"
            insertText(emoji)
            textareaRef.current?.focus({ preventScroll: true })
          }}
        />
      )}
    </>
  )
}
